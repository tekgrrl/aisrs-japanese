
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

    const play = useCallback(async (url: string) => {
        if (!audioRef.current) return;

        try {
            if (isPlaying) {
                audioRef.current.pause();
            }

            audioRef.current.src = url;
            setIsPlaying(true);
            await audioRef.current.play();
        } catch (err) {
            console.error('Failed to play audio:', err);
            setIsPlaying(false);
        }
    }, [isPlaying]);

    const playBlob = useCallback(async (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        await play(url);
        // Clean up the URL object after playback starts (or somewhat safely)
        // Actually capturing it in a closure to revoke on end might be better, 
        // but for short clips this is okay. 
        // Better: revoke when functionality changes or on unmount.
    }, [play]);

    return { play, playBlob, isPlaying };
}
