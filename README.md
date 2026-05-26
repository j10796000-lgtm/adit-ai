# Adit AI

Adit AI is a research-focused chatbot interface designed to feel closer to a search engine than a normal chat window.

## Features

- Sign-in / lock screen backed by a local encrypted vault
- AES-GCM encrypted conversation storage in the browser
- Research chat workspace with web-search-ready serverless endpoint
- File attachment flow for text-based files
- Vercel API route for OpenAI Responses API integration

## Vercel setup

Add this environment variable in Vercel to enable live AI research:

```text
OPENAI_API_KEY=your_key_here
```

Optional:

```text
OPENAI_MODEL=gpt-4.1-mini
```

## Privacy boundary

Saved conversations are encrypted locally in the browser. Prompts and file excerpts must still be sent to the configured AI provider when the user asks Adit AI to answer.
