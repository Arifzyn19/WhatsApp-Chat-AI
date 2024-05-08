import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const geminiApiKeys = process.env.GEMINI_API_KEYS;

async function runGeminiPro(prompt, index) {
  const genAI = new GoogleGenerativeAI(geminiApiKeys[index]);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  console.log(text);
  return text;
}

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(path).toString("base64"),
      mimeType,
    },
  };
}

async function runGeminiVision(prompt, path, mimeType) {
  const genAI = new GoogleGenerativeAI(geminiApiKeys);
  const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
  const imageParts = [fileToGenerativePart(path, mimeType)];
  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  const text = response.text();
  console.log(text);
  return text;
}

export { runGeminiPro, runGeminiVision, geminiApiKeys };
