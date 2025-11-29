<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ThaiGuide AI - Kaggle Agents Intensive Capstone Project

**Competition:** [Agents Intensive - Capstone Project](https://www.kaggle.com/competitions/agents-intensive-capstone-project/)
**Sponsor:** Google LLC
**License:** CC-BY-SA 4.0

## About ThaiGuide AI

ThaiGuide AI is an intelligent travel companion powered by Google's Gemini API, featuring "Somsri" - your friendly Thai travel guide. Built as a React progressive web application, it offers three distinct interaction modes to help you plan and explore Thailand.

## Live Deployment

🌐 **Production:** [https://thaiguide-ai-273976412347.us-west1.run.app/](https://thaiguide-ai-273976412347.us-west1.run.app/)
🔧 **AI Studio (Development):** [https://ai.studio/apps/drive/1stOIVMmppGyBYld3kBKI39FVRB96byzt](https://ai.studio/apps/drive/1stOIVMmppGyBYld3kBKI39FVRB96byzt)

Deployed on Google Cloud Run for scalable, serverless hosting.

## Features

- **💬 Chat Interface**: Text-based conversations with Somsri featuring real-time grounding sources, map previews, and text-to-speech
- **🗺️ Travel Planner**: AI-generated structured itineraries with interactive task management, embedded maps, and calendar export (iCal, Google Calendar)
- **🎤 Voice Interface**: Real-time bidirectional voice conversations using Gemini Live API with audio transcription and summarization

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Installation & Setup

**Recommended: Using Yarn (especially for Windows)**

```bash
# Install dependencies
yarn install

# Set up environment variables
# Create a .env.local file in the root directory
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# Start development server
yarn dev
```

The app will be available at `http://localhost:3000`

**Alternative: Using npm**

```bash
npm install
npm run dev
```

### Environment Configuration

Set the `GEMINI_API_KEY` in `.env.local`:

```
GEMINI_API_KEY=your_gemini_api_key
```

### Build for Production

```bash
# Using Yarn (recommended)
yarn build

# Using npm
npm run build
```

Preview the production build:

```bash
# Using Yarn
yarn preview

# Using npm
npm run preview
```

## Competition Compliance

### License
This project is licensed under **CC-BY-SA 4.0** (Creative Commons Attribution-ShareAlike 4.0) as required for Kaggle competition winners. See the [full license](https://creativecommons.org/licenses/by-sa/4.0/deed.en).

### External Tools & APIs
This project uses the following external tools and APIs that are reasonably accessible to all participants:

- **Google Gemini API** (gemini-2.5-flash, gemini-2.5-flash-preview-tts, gemini-2.5-flash-native-audio-preview)
- **Google Maps Embed API**
- **React** 19.2.0
- **Vite** 6.2.0
- **@google/genai SDK** 1.30.0
- **Leaflet** (via CDN) for map rendering
- **react-markdown** 10.1.0

All dependencies are free and open-source or available through free tier API access.

### Team Size
Maximum team size: 4 members (as per competition rules)

### Full Rules
See [DOCS/Competition Rules.md](DOCS/Competition%20Rules.md) for complete competition rules and requirements.

## Technical Stack

- **Frontend:** React 19 with TypeScript
- **Build Tool:** Vite 6
- **AI Engine:** Google Gemini API (2.5-flash variants)
- **Styling:** Tailwind CSS (via CDN)
- **Maps:** Google Maps Embed API, Leaflet
- **Audio Processing:** Web Audio API, MediaRecorder API
- **Deployment:** Google Cloud Run

## Architecture

ThaiGuide AI uses a three-tab interface with shared state management:

- **Chat → Plan**: Grounding sources from chat can be added to travel plans
- **Voice → Plan**: Conversation summaries are saved as "sticky notes" for planning
- **Shared Places**: Google Maps locations flow between all interfaces

See [CLAUDE.md](CLAUDE.md) for detailed developer documentation and architecture.

## Development

### Project Structure

```
/
├── components/          # React components (Chat, Plan, Voice, Navigation)
├── services/           # API integration (geminiService, audioUtils)
├── DOCS/              # Competition rules and deployment guides
├── App.tsx            # Main application shell
├── types.ts           # TypeScript type definitions
└── vite.config.ts     # Vite configuration
```

### Key Files

- `services/geminiService.ts` - All Gemini API interactions
- `components/ChatInterface.tsx` - Text chat with TTS and maps
- `components/PlanInterface.tsx` - Itinerary generator and task manager
- `components/VoiceInterface.tsx` - Real-time voice conversation
- `CLAUDE.md` - Comprehensive developer documentation

## Deployment

This application is deployed on **Google Cloud Run**, a fully managed serverless platform. The deployment is managed through Google AI Studio and syncs automatically.

For deployment concepts and Cloud Run integration, see [DOCS/Utilize the Streamlit Framework.md](DOCS/Utilize%20the%20Streamlit%20Framework.md) (applicable concepts for Cloud Run deployment).

## Support & Documentation

- **Developer Guide:** [CLAUDE.md](CLAUDE.md)
- **Competition Rules:** [DOCS/Competition Rules.md](DOCS/Competition%20Rules.md)
- **Kaggle Competition:** [https://www.kaggle.com/competitions/agents-intensive-capstone-project/](https://www.kaggle.com/competitions/agents-intensive-capstone-project/)
- **Gemini API Docs:** [https://ai.google.dev/docs](https://ai.google.dev/docs)

---

Built with ❤️ for the Kaggle Agents Intensive Capstone Project
