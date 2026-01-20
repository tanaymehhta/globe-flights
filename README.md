# Globe Flights

An interactive 3D globe visualization where you can fly between cities and simulate geopolitical conflicts. Built with Three.js and Vite.

![Three.js](https://img.shields.io/badge/Three.js-black?style=flat&logo=three.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-black?style=flat&logo=vercel&logoColor=white)

## Features

### Globe & Flights
- **Interactive 3D Globe** - Fully rotatable Earth with realistic textures and atmosphere
- **City Search** - Search and autocomplete for any city worldwide using OpenStreetMap
- **Animated Flights** - Watch planes fly great-circle routes between destinations
- **Multi-city Journeys** - Add multiple cities and watch continuous flights between them
- **Speed Controls** - Adjust flight speed from 0.5x to 5x
- **Country Borders** - Real GeoJSON country boundaries rendered on the globe

### War Room
- **Attack Commands** - Natural language commands like "USA attacks Russia"
- **AI-Powered Parsing** - GPT-3.5 interprets attack commands via secure server-side API
- **Missile Animations** - Ballistic missile trajectories with trails and explosions
- **Damage Effects** - Fire, smoke, craters, and glowing damage zones
- **Multi-target Attacks** - "India attacks China, Pakistan and Afghanistan"

## Tech Stack

- **Three.js** - 3D rendering and WebGL
- **Vite** - Build tool and dev server
- **OpenStreetMap Nominatim** - Geocoding API for city search
- **OpenAI GPT-3.5** - Natural language command parsing
- **Vercel Edge Functions** - Secure server-side API for OpenAI calls

## Getting Started

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:5173

### Environment Variables

For local development with the War Room feature, create a `.env` file:

```
OPENAI_API_KEY=sk-your-key-here
```

Note: The API key is only used server-side and is never exposed to the client.

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variable: `OPENAI_API_KEY`
4. Deploy

The app will auto-deploy on every push to main.

## Usage

### Flying Between Cities
1. Type a city name in the search box
2. Select from autocomplete or press Enter
3. Watch the plane fly to your destination
4. Add more cities to create a journey
5. Use +/- to control speed

### War Room
1. Type attack commands in natural language
2. Examples:
   - "USA attacks North Korea"
   - "Russia attacks Ukraine"
   - "India attacks China, Pakistan and Afghanistan"
3. Watch missiles launch and damage effects render

## License

MIT
