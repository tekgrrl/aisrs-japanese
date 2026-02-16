
export interface ITtsProvider {
    /**
     * Generates audio from the given text.
     * @param text The text to convert to speech.
     * @returns A Promise that resolves to a Buffer containing the audio data (e.g., MP3).
     */
    generateAudio(text: string): Promise<Buffer>;
}
