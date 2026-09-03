# Dream Team

Stała aplikacja do organizacji wyjazdów karpiowych Patryka i Maćka.

## Architektura

- Cloudflare Workers — hosting aplikacji i API
- Cloudflare D1 — trwała baza danych
- GitHub — kod, historia zmian i automatyczne wdrożenia
- `public/` — frontend
- `src/worker.js` — API
- `migrations/` — wersjonowany schemat bazy

Projekt jest wieloletni: łowiska, terminy i wyjazdy są danymi, a nie osobnymi stronami.
