// Formularwache im Content Script (content/formwache.js; Design-Review KI-Agenten
// 16.10.2026, Auflagen 8, 9, 11). Kleine eigene Attrappe: Formular, Felder, Ereignis.
// Alle Werte erfunden (offizielle Test-IBAN).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { EXT, ENGINE_FILES } from './helpers/load.mjs';

const IBAN = 'CH93 0076 2011 6238 5295 7';
const FILES = ['branding.js', ...ENGINE_FILES, 'common/quellen.js', 'common/policy.js', 'content/formwache.js'];

function setup() {
  const listeners = {};
  const msgs = [];
  let onMsg = null;
  let reply = (m) => (m.t === 'formFound' ? { nonce: 'n'.repeat(32) } : null);
  const chrome = { runtime: { id: 'ext', sendMessage: async (m) => { msgs.push(JSON.parse(JSON.stringify(m))); return reply(m); }, onMessage: { addListener: (f) => { onMsg = f; } } } };
  const g = { chrome, navigator: { language: 'de-CH', languages: ['de-CH'] }, TextEncoder, performance, URL, Intl, atob,
    addEventListener: (t, f, cap) => { (listeners[t] = listeners[t] || []).push({ f, cap }); } };
  const ctx = vm.createContext(g);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
  const field = (value, type = 'text', tagName = 'INPUT') => ({ tagName, type, value });
  const form = (elements, editable = []) => ({ tagName: 'FORM', elements, querySelectorAll: () => editable });
  const submit = (f) => {
    const e = { target: f, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    for (const l of listeners.submit || []) l.f(e);
    return e;
  };
  const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { listeners, msgs, field, form, submit, tick, pass: (msg, sender) => onMsg(msg, sender), setReply: (f) => { reply = f; } };
}

test('Absenden mit IBAN in einem Feld wird gestoppt; an den Service Worker nur Typ/Gruppe/Anzahl (Auflage 9)', async () => {
  const s = setup();
  assert.ok(s.listeners.submit.every((l) => l.cap === true), 'Capture-Phase');
  assert.equal(s.submit(s.form([s.field('Anna'), s.field('Termin am Montag', '', 'TEXTAREA')])).prevented, false, 'sauber');
  const e = s.submit(s.form([s.field('Anna'), s.field('Bitte auf ' + IBAN + ' ueberweisen', '', 'TEXTAREA')]));
  assert.deepEqual([e.prevented, e.stopped], [true, true]);
  await s.tick();
  const found = s.msgs.filter((m) => m.t === 'formFound');
  assert.equal(found.length, 1);
  assert.deepEqual(Object.keys(found[0]).sort(), ['items', 't']);
  assert.ok(found[0].items.some((i) => i.id === 'iban') && found[0].items.every((i) => Object.keys(i).sort().join() === 'cat,id,n'));
  assert.ok(!JSON.stringify(s.msgs).includes('2011'), 'nie Werte');
  const ed = { isContentEditable: true, innerText: 'Konto ' + IBAN };
  assert.equal(s.submit(s.form([], [ed])).prevented, true, 'bearbeitbarer Bereich im Formular');
  const outside = s.field(IBAN, 'search');   // <input form="..."> steht in form.elements
  assert.equal(s.submit(s.form([outside])).prevented, true, 'zugeordnetes Feld');
});

test('Passwort-, Datei-, Knopf- und versteckte Felder werden nicht geprueft; form.submit() und fetch sind eine dokumentierte Luecke (Auflage 11)', () => {
  const s = setup();
  for (const type of ['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image']) assert.equal(s.submit(s.form([s.field(IBAN, type)])).prevented, false, type);
  const src = fs.readFileSync(path.join(EXT, 'content', 'formwache.js'), 'utf8');
  assert.match(src, /form\.submit\(\) und fetch\/XHR loesen kein submit-Ereignis aus/);
  assert.ok(!/prototype\.submit|postMessage|onMessageExternal|chrome\.storage|fetch\(|XMLHttpRequest/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'kein Patchen, kein postMessage, kein Speicher, kein Netz');
});

test('Durchlass nur vom Service Worker mit passender Nonce, einmalig, nur fuer denselben Inhalt (Auflagen 8, 9)', async () => {
  const s = setup();
  const vals = () => [s.field('Anna'), s.field('Konto ' + IBAN)];
  assert.equal(s.submit(s.form(vals())).prevented, true);
  await s.tick();
  s.pass({ t: 'formPass', n: 'n'.repeat(32) }, { id: 'ext', tab: { id: 1 } });
  assert.equal(s.submit(s.form(vals())).prevented, true, 'Absender mit Tab (anderes Content Script) zaehlt nicht');
  await s.tick();
  s.pass({ t: 'formPass', n: 'x'.repeat(32) }, { id: 'ext' });
  assert.equal(s.submit(s.form(vals())).prevented, true, 'falsche Nonce');
  await s.tick();
  s.pass({ t: 'formPass', n: 'n'.repeat(32) }, { id: 'fremd' });
  assert.equal(s.submit(s.form(vals())).prevented, true, 'fremde Erweiterung');
  await s.tick();
  s.pass({ t: 'formPass', n: 'n'.repeat(32) }, { id: 'ext' });
  const changed = [s.field('Anna'), s.field('Konto ' + IBAN + ' und mehr')];
  assert.equal(s.submit(s.form(changed)).prevented, true, 'geaenderter Inhalt wird neu geprueft');
  await s.tick();
  s.pass({ t: 'formPass', n: 'n'.repeat(32) }, { id: 'ext' });
  assert.equal(s.submit(s.form(changed)).prevented, false, 'derselbe Inhalt geht einmal durch');
  assert.equal(s.submit(s.form(changed)).prevented, true, 'nur einmal');
  s.setReply(() => ({ busy: true }));
  await s.tick();
  s.pass({ t: 'formPass', n: 'n'.repeat(32) }, { id: 'ext' });
  assert.equal(s.submit(s.form(vals())).prevented, true, 'Service Worker busy: kein Durchlass ohne Nonce');
});

test('Weitere Absendeversuche bei offenem Fenster (busy) verdraengen die offene Meldung nicht (Auflage 10, E2E 16.10.2026)', async () => {
  const s = setup();
  const a = () => [s.field('Konto ' + IBAN)];
  assert.equal(s.submit(s.form(a())).prevented, true);
  await s.tick();
  s.setReply(() => ({ busy: true }));
  assert.equal(s.submit(s.form([s.field('Anderes Konto ' + IBAN)])).prevented, true);
  await s.tick();
  s.pass({ t: 'formPass', n: 'n'.repeat(32) }, { id: 'ext' });
  assert.equal(s.submit(s.form(a())).prevented, false, 'freigegeben wird der Inhalt der offenen Meldung');
});
