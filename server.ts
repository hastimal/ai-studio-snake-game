import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(express.json());

  // Initialize Gemini AI client server-side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // API Route for Gemini AI Game Coach
  app.post('/api/coach', async (req, res) => {
    try {
      const { score, applesEaten, difficulty, level, gameTime, gameOverReason, theme } = req.body;

      const prompt = `Analyze this Snake Game session and act as an expert AI Game Coach:
- Score: ${score}
- Apples Eaten: ${applesEaten}
- Difficulty: ${difficulty}
- Level: ${level}
- Survival Time: ${gameTime} seconds
- Game Over Reason: ${gameOverReason}
- Theme: ${theme}

Provide coaching feedback with a rating (Beginner, Good, Great, or Snake Master), a short performance summary, 2 actionable tips, a funny/encouraging message, and a challenge for the next game.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rating: {
                type: Type.STRING,
                description: 'Performance rating: Beginner, Good, Great, or Snake Master'
              },
              summary: {
                type: Type.STRING,
                description: 'Short performance summary of the game session'
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Two personalized gameplay tips'
              },
              encouragement: {
                type: Type.STRING,
                description: 'One funny, encouraging message'
              },
              nextChallenge: {
                type: Type.STRING,
                description: 'One specific challenge for the next game'
              }
            },
            required: ['rating', 'summary', 'tips', 'encouragement', 'nextChallenge']
          }
        }
      });

      const jsonText = response.text;
      if (!jsonText) {
        throw new Error('Empty response from Gemini AI');
      }

      const coachData = JSON.parse(jsonText);
      res.json(coachData);
    } catch (error: any) {
      console.error('Error generating AI coaching:', error);
      res.status(500).json({ 
        error: 'Failed to generate AI coaching feedback.',
        details: error?.message || 'Unknown error'
      });
    }
  });

  // Setup Vite in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
