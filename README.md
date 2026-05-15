# Absolute Ear

Web app para analizar notas, acordes y afinacion desde el microfono, con una API inicial para subir partituras.

## Fase 1

- Frontend Vite + React + TypeScript.
- Captura de micro con Web Audio API.
- Estimacion de pitch por autocorrelacion.
- Mapeo a nota, octava, frecuencia y desviacion en cents.
- Indicador de afinacion y picos de espectro.
- Deteccion inicial de acordes desde clases de pitch.
- Subida de MusicXML/MXL con extraccion inicial de notas y acordes simultaneos.
- Subida aceptada para PDF, imagen y MIDI, preparada para el motor OMR/MIDI completo.
- Backend FastAPI con /api/health y /api/scores/analyze.

## Requisitos

- Node.js 24 o compatible con Vite 8.
- Python 3.12+.

## Instalacion

    npm install
    python3 -m venv backend/.venv
    backend/.venv/bin/pip install -r backend/requirements.txt

## Desarrollo

En dos terminales:

    npm run api
    npm run dev

O en una sola:

    npm run dev:all

La web queda en http://localhost:5173. El microfono funciona en localhost o HTTPS.

Si el puerto 8000 esta ocupado:

    API_PORT=8010 npm run api
    VITE_API_PROXY_TARGET=http://127.0.0.1:8010 npm run dev

## Validacion

    npm run test
    npm run build
    PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests
    backend/.venv/bin/python -m compileall backend/app

## Siguientes fases

- Mejorar pitch con YIN/McLeod y suavizado temporal.
- Separar modo mono y modo piano polifonico.
- Parser MIDI real con tiempos, compases y cuantizacion.
- OMR para PDF/imagen usando Audiveris u otro motor especializado.
- Comparacion de interpretacion contra partitura objetivo.
- Historial de sesiones y ejercicios guiados.
