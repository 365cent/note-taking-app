import { NextRequest, NextResponse } from "next/server";

const CLOUDFLARE_ACCOUNT_ID = "8c9f126e8236df7c3ecfb44264c18351";
const CLOUDFLARE_API_TOKEN = "DNq3iGE2t983Vd2qGhQLuC0XhOyiE8QFuZtOVeGe";

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const audio = formData.get("audio") as Blob;

  if (!audio) {
    return NextResponse.json(
      { error: "No audio file provided" },
      { status: 400 },
    );
  }

  try {
    // Step 1: Transcribe audio using Whisper API
    const whisperResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        },
        body: audio,
      },
    );

    if (!whisperResponse.ok) {
      throw new Error(
        `Whisper API error: ${whisperResponse.status} ${whisperResponse.statusText}`,
      );
    }

    const whisperData = await whisperResponse.json();
    const transcription = whisperData.result.text;

    // Step 2: Generate notes using Llama API
    const llamaResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes lecture transcripts into concise markdown notes.",
            },
            {
              role: "user",
              content: `Based on the following transcription, generate concise and well-structured notes. Focus on key points, important details, and main ideas. Use clear language and organize the information in a logical manner:\n\n${transcription}`,
            },
          ],
        }),
      },
    );

    if (!llamaResponse.ok) {
      throw new Error(
        `Llama API error: ${llamaResponse.status} ${llamaResponse.statusText}`,
      );
    }

    const llamaData = await llamaResponse.json();
    const generatedNotes = llamaData.result.response;

    return NextResponse.json({ transcription, notes: generatedNotes });
  } catch (error) {
    console.error("Error processing audio:", error);
    return NextResponse.json(
      { error: "Failed to process audio" },
      { status: 500 },
    );
  }
}
