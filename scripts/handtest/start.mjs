// Oeffnet Edge sichtbar mit dem dauerhaften Handtest-Profil, OHNE DevTools,
// damit du dich einmal selbst auf den vier KI-Seiten anmeldet. Das Skript
// meldet nie an und liest keine Zugangsdaten. Die Erweiterung laedt erst lauf.mjs.
// Edge selbst nicht mit einem Konto anmelden, nie mit einem Firmenkonto (Auflage 2).
// Aufruf: node scripts/handtest/start.mjs
import { spawn } from 'node:child_process';
import { EDGE, SEITEN, edgeArgs, edgeEnv, profilPruefen, aufraeumen } from './seiten.mjs';

aufraeumen(false);
spawn(EDGE, [...edgeArgs({ profil: profilPruefen() }), ...SEITEN.map((s) => s.url)],
  { env: edgeEnv(), detached: true, stdio: 'ignore', windowsHide: false }).unref();
console.log('Handtest-Edge gestartet. Auf den vier Seiten selbst anmelden (nur private Konten), dann Edge schliessen.');
console.log('Nie ein Arbeitgeber- oder Kundenkonto in diesem Profil anmelden, Edge selbst ohne Konto lassen.');
