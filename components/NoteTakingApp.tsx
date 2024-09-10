'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { MicIcon, StopCircleIcon, RefreshCwIcon, PlayIcon, PauseIcon, ChevronDownIcon, ChevronUpIcon, Loader2 } from 'lucide-react'
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

export default function NoteTakingApp() {
    const [isRecording, setIsRecording] = useState(false)
    const [notes, setNotes] = useState('')
    const [status, setStatus] = useState('')
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState('')
    const [debugInfo, setDebugInfo] = useState('')
    const [volume, setVolume] = useState(0)
    const [audioUrl, setAudioUrl] = useState('')
    const [isPlaying, setIsPlaying] = useState(false)
    const [isDebugOpen, setIsDebugOpen] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const dataArray = useRef<Uint8Array | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const lastRecordedAudio = useRef<Blob | null>(null);
    const animationFrameId = useRef<number | null>(null);
    const audioElement = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    interface Window {
        webkitAudioContext: typeof AudioContext;
    }

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.current = new MediaRecorder(stream);
            audioChunks.current = [];

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioContext.current = new AudioContextClass();
            analyser.current = audioContext.current.createAnalyser();
            const source = audioContext.current.createMediaStreamSource(stream);
            source.connect(analyser.current);
            analyser.current.fftSize = 256;
            const bufferLength = analyser.current.frequencyBinCount;
            dataArray.current = new Uint8Array(bufferLength);

            const updateVolume = () => {
                if (analyser.current && dataArray.current) {
                    analyser.current.getByteFrequencyData(dataArray.current);
                    const average = dataArray.current.reduce((acc, val) => acc + val, 0) / dataArray.current.length;
                    const newVolume = Math.min(100, (average / 128) * 100);
                    setVolume(newVolume);
                    setDebugInfo(prevDebug => `${prevDebug}\nVolume: ${newVolume.toFixed(2)}`);
                }
                animationFrameId.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();

            if (mediaRecorder.current) {
                mediaRecorder.current.ondataavailable = (event: BlobEvent) => {
                    audioChunks.current.push(event.data);
                };

                mediaRecorder.current.onstop = async () => {
                    if (animationFrameId.current) {
                        cancelAnimationFrame(animationFrameId.current);
                    }
                    setStatus('Processing audio...');
                    setProgress(10);
                    const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
                    lastRecordedAudio.current = audioBlob;
                    const url = URL.createObjectURL(audioBlob);
                    setAudioUrl(url);
                    await processAudio(audioBlob);
                };

                mediaRecorder.current.start();
                setIsRecording(true);
                setStatus('Recording...');
                setProgress(0);
                setError('');
                setDebugInfo('Recording started. Debugging information:');
                setAudioUrl('');
                setRecordingTime(0);

                timerRef.current = setInterval(() => {
                    setRecordingTime(prevTime => prevTime + 1);
                }, 1000);

                processingIntervalRef.current = setInterval(async () => {
                    const currentAudioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
                    await processAudio(currentAudioBlob, true);
                }, 60000);
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            setError(`Could not start recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setStatus('');
            setDebugInfo(`Error details: ${error instanceof Error ? error.toString() : 'Unknown error'}`);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current && isRecording) {
            mediaRecorder.current.stop();
            setIsRecording(false);
            setVolume(0);
            setDebugInfo(prevDebug => `${prevDebug}\nRecording stopped.`);

            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            if (processingIntervalRef.current) {
                clearInterval(processingIntervalRef.current);
            }
        }
    }, [isRecording]);

    const processAudio = async (audioBlob: Blob, isPartial = false) => {
        try {
            if (!isPartial) {
                setIsProcessing(true)
            }
            setStatus('Processing audio...')
            setProgress(30)
            const formData = new FormData()
            formData.append('audio', audioBlob)
            formData.append('isPartial', isPartial.toString())

            const response = await fetch('/api/process-audio', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error(`Processing error: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()
            if (isPartial) {
                setNotes(prevNotes => prevNotes + '\n\n' + data.notes)
            } else {
                setNotes(data.notes)
            }
            setStatus('Notes generated successfully!')
            setProgress(100)
            setError('')
            setDebugInfo(prevDebug => `${prevDebug}\nTranscription: ${data.transcription}\n\nGenerated Notes: ${data.notes}`)
        } catch (error) {
            console.error('Error processing audio:', error);
            setError(`Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setDebugInfo(prevDebug => `${prevDebug}\nFull error: ${JSON.stringify(error, null, 2)}`);
            setStatus('');
            setProgress(0);
        } finally {
            if (!isPartial) {
                setIsProcessing(false);
            }
        }
    }


    const retryProcessing = () => {
        if (lastRecordedAudio.current) {
            processAudio(lastRecordedAudio.current)
        } else {
            setError('No recorded audio available. Please record again.')
        }
    }

    const togglePlayPause = () => {
        if (audioElement.current) {
            if (isPlaying) {
                audioElement.current.pause();
            } else {
                audioElement.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) {
            const url = URL.createObjectURL(file);
            setAudioUrl(url);
            lastRecordedAudio.current = file;
            setDebugInfo(`Audio file dropped: ${file.name}`);
            processAudio(file);
        } else {
            setError('Please drop a valid audio file.');
        }
    }, []);

    useEffect(() => {
        if (progress === 100) {
            const timer = setTimeout(() => {
                setStatus('')
                setProgress(0)
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [progress])

    useEffect(() => {
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (audioContext.current) {
                audioContext.current.close();
            }
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            if (processingIntervalRef.current) {
                clearInterval(processingIntervalRef.current);
            }
        };
    }, [audioUrl]);

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    return (
        <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">In-Class Note Taking App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-300 ${isDragging ? 'border-primary bg-primary/10' : 'border-gray-300'
                        }`}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <p className="text-lg font-medium">
                        Drag and drop audio files here or use the buttons below to record
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-4">
                    <Button onClick={startRecording} disabled={isRecording || isProcessing}>
                        <MicIcon className="mr-2 h-4 w-4" /> Start Recording
                    </Button>
                    <Button onClick={stopRecording} disabled={!isRecording || isProcessing} variant="destructive">
                        <StopCircleIcon className="mr-2 h-4 w-4" /> Stop Recording
                    </Button>
                    {audioUrl && (
                        <Button onClick={togglePlayPause} disabled={isProcessing}>
                            {isPlaying ? <PauseIcon className="mr-2 h-4 w-4" /> : <PlayIcon className="mr-2 h-4 w-4" />}
                            {isPlaying ? 'Pause' : 'Play'} Recording
                        </Button>
                    )}
                    {error && (
                        <Button onClick={retryProcessing} variant="outline" disabled={isProcessing}>
                            <RefreshCwIcon className="mr-2 h-4 w-4" /> Retry Processing
                        </Button>
                    )}
                </div>
                {isRecording && (
                    <div className="text-center">
                        <p className="mb-2 font-medium">Recording Time: {formatTime(recordingTime)}</p>
                        <p className="mb-2 font-medium">Recording Volume</p>
                        <Progress value={volume} className="w-full" />
                    </div>
                )}
                {audioUrl && (
                    <audio ref={audioElement} src={audioUrl} onEnded={() => setIsPlaying(false)} className="w-full" controls />
                )}
                {isProcessing && (
                    <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <p className="text-lg font-medium">Processing audio...</p>
                    </div>
                )}
                {status && !isRecording && !isProcessing && (
                    <div className="text-center">
                        <p className="mb-2 font-medium">{status}</p>
                        <Progress value={progress} className="w-full" />
                    </div>
                )}
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <Collapsible open={isDebugOpen} onOpenChange={setIsDebugOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full">
                            Debug Information {isDebugOpen ? <ChevronUpIcon className="ml-2 h-4 w-4" /> : <ChevronDownIcon className="ml-2 h-4 w-4" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <Alert variant="default" className="mt-2">
                            <AlertTitle>Debug Information</AlertTitle>
                            <AlertDescription>
                                <pre className="whitespace-pre-wrap overflow-x-auto">
                                    {debugInfo}
                                </pre>
                            </AlertDescription>
                        </Alert>
                    </CollapsibleContent>
                </Collapsible>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Generated Notes</h3>
                        <Button onClick={() => setIsEditing(!isEditing)} variant="outline" size="sm">
                            {isEditing ? 'View' : 'Edit'}
                        </Button>
                    </div>
                    {isEditing ? (
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Your notes will appear here..."
                            rows={15}
                            className="w-full resize-none focus:ring-2 focus:ring-primary"
                        />
                    ) : (
                        <div className="prose prose-sm max-w-none">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                            >
                                {notes}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}