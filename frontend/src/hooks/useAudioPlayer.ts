
import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioPlayer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.onended = () => setIsPlaying(false);
        audioRef.current.onerror = (e) => {
            console.error('Audio playback error', e);
            setIsPlaying(false);
        };

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const currentUrlRef = useRef<string | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (currentUrlRef.current) {
                URL.revokeObjectURL(currentUrlRef.current);
            }
        };
    }, []);

    const play = useCallback(async (url: string) => {
        if (!audioRef.current) return;

        try {
            if (isPlaying) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0; // Reset
            }

            audioRef.current.src = url;
            // audioRef.current.load(); // Ensure new source is loaded
            try {
                await audioRef.current.play();
                setIsPlaying(true);
            } catch (playError) {
                // Auto-play might be blocked or race condition
                console.warn("Playback failed or was interrupted", playError);
                setIsPlaying(false);
            }
        } catch (err) {
            console.error('Failed to play audio:', err);
            setIsPlaying(false);
        }
    }, [isPlaying]);

    const playBlob = useCallback(async (blob: Blob) => {
        // Revoke previous URL if exists
        if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        currentUrlRef.current = url;
        await play(url);
    }, [play]);

    return { play, playBlob, isPlaying };
}
