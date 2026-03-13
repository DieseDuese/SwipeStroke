import React, { useState, useRef, useEffect } from 'react';
import { setMode, setSlide, setHampVelocity, startHampMotion, stopHampMotion } from '../api/handy';
import { Power, Activity, Play, Square, Circle } from 'lucide-react';

export default function PillarControl({ connectionKey, onDisconnect, onIntensityChange }) {
    const [active, setActive] = useState(false);
    const [settingUp, setSettingUp] = useState(false);

    // Drag state
    const [isSwiping, setIsSwiping] = useState(false);
    const [currentY, setCurrentY] = useState(50); // visual y percentage
    const [pattern, setPattern] = useState({ min: 0, max: 100, velocity: 50 });

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [countdown, setCountdown] = useState(null);

    // Use ref for sequence so setTimeout closures in playLoop don't read stale empty arrays
    const loopSequenceRef = useRef([]);
    const [sequenceCount, setSequenceCount] = useState(0); // For UI reactiveness

    // Refs for recording/playback timing
    const recordStartTimeRef = useRef(null);
    const recordIntervalRef = useRef(null);
    const recordTimeoutRef = useRef(null);
    const playbackTimerRef = useRef(null);
    const playbackTimeoutsRef = useRef([]);

    const pillarRef = useRef(null);
    const swipeData = useRef({
        startTime: 0,
        minY: 100,
        maxY: 0,
        totalDistance: 0,
        lastY: null,
        lastTime: null,
        history: []
    });

    // visual indicator animation state
    const [visualPos, setVisualPos] = useState(50);
    const animDirection = useRef(1);

    // Calculate intensity score and bubble up whenever the pattern changes
    useEffect(() => {
        if (onIntensityChange) {
            const strokeLength = pattern.max - pattern.min;
            const intensityScore = Math.round((strokeLength + pattern.velocity) / 2);
            onIntensityChange(intensityScore);
        }
    }, [pattern, onIntensityChange]);

    useEffect(() => {
        // Reset pattern animation when it changes or when active
        let animationFrameId;
        let lastTime = performance.now();

        const animate = (time) => {
            if (active && !isSwiping) {
                const dt = time - lastTime;
                lastTime = time;

                // The Handy motor moves at a relatively constant absolute speed based on the velocity %.
                // At 100% velocity, it can traverse the entire length (100%) very quickly (e.g. 3-4 times a second).
                // Let's approximate: 100% velocity = 400% height / second.
                const speedPercentPerSec = (pattern.velocity / 100) * 400;
                const distancePerFrame = speedPercentPerSec * (dt / 1000);

                setVisualPos(prev => {
                    let next = prev + (distancePerFrame * animDirection.current);
                    if (next >= pattern.max) {
                        next = pattern.max;
                        animDirection.current = -1;
                    } else if (next <= pattern.min) {
                        next = pattern.min;
                        animDirection.current = 1;
                    }
                    return next;
                });
            }
            animationFrameId = requestAnimationFrame(animate);
        };

        animationFrameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameId);
    }, [active, isSwiping, pattern]);

    const toggleActive = async () => {
        if (settingUp) return;
        setSettingUp(true);

        if (active) {
            await stopHampMotion(connectionKey);
            setActive(false);
            if (isRecording) stopRecording();
            if (isPlaying) stopPlayback();
        } else {
            // Start flow: Set Mode HAMP (2) -> Set default Slide -> Start Motion -> Set default velocity
            const modeOk = await setMode(connectionKey, 2); // HAMP mode
            if (modeOk) {
                await setSlide(connectionKey, pattern.min, pattern.max);
                await startHampMotion(connectionKey);
                await setHampVelocity(connectionKey, pattern.velocity);
                setActive(true);
            } else {
                alert("Konnte den Modus nicht ändern. Ist das Handy online?");
            }
        }
        setSettingUp(false);
    };

    const startRecording = () => {
        if (!active || isPlaying) return;
        loopSequenceRef.current = [];
        setSequenceCount(0);
        setIsRecording(true);
        setCountdown(10);
        recordStartTimeRef.current = performance.now();

        // Update countdown every second
        recordIntervalRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(recordIntervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // Auto-stop after 10 seconds
        recordTimeoutRef.current = setTimeout(() => {
            stopRecording();
        }, 10000);
    };

    const stopRecording = () => {
        setIsRecording(false);
        setCountdown(null);
        recordStartTimeRef.current = null;
        if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
        if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    };

    const startPlayback = () => {
        if (!active || isRecording || loopSequenceRef.current.length === 0) return;
        setIsPlaying(true);
        playLoop(); // Start first loop iteration
    };

    const stopPlayback = () => {
        setIsPlaying(false);
        if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
        playbackTimeoutsRef.current.forEach(clearTimeout);
        playbackTimeoutsRef.current = [];
    };

    const playLoop = () => {
        // Clear any previous timeouts just in case
        playbackTimeoutsRef.current.forEach(clearTimeout);
        playbackTimeoutsRef.current = [];

        // Schedule all API calls for the 10-second loop using the ref
        loopSequenceRef.current.forEach((event) => {
            const timeoutId = setTimeout(async () => {
                if (!active) return;
                setPattern({ min: event.min, max: event.max, velocity: event.velocity });

                // Jump visual indicator roughly to the start of this pattern
                setVisualPos(Math.min(event.max, Math.max(event.min, 100 - event.lastTargetY)));

                await setSlide(connectionKey, event.min, event.max);
                await setHampVelocity(connectionKey, event.velocity);
            }, event.relativeTime);
            playbackTimeoutsRef.current.push(timeoutId);
        });

        // Re-trigger loop after exactly 10s
        playbackTimerRef.current = setTimeout(() => {
            playLoop();
        }, 10000);
    };

    const handlePointerDown = (e) => {
        e.preventDefault();
        if (!pillarRef.current) return;

        // Capture all pointer events (move, up, cancel) to this element until released.
        // This prevents the swipe from aborting if the user's finger slips outside the track bounds.
        e.target.setPointerCapture(e.pointerId);

        setIsSwiping(true);
        const rect = pillarRef.current.getBoundingClientRect();
        const yPercent = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)); // 0 top, 100 bottom
        setCurrentY(yPercent);
        setVisualPos(100 - yPercent); // visual pos uses 0=bottom, 100=top like the API

        swipeData.current = {
            startTime: performance.now(),
            minY: yPercent,
            maxY: yPercent,
            totalDistance: 0,
            lastY: yPercent,
            lastTime: performance.now(),
            history: [{ t: performance.now(), y: yPercent }]
        };
    };

    const handlePointerMove = (e) => {
        if (!isSwiping || !pillarRef.current) return;
        e.preventDefault();

        const rect = pillarRef.current.getBoundingClientRect();
        const yPercent = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

        const time = performance.now();
        const dy = Math.abs(yPercent - swipeData.current.lastY);

        swipeData.current.history.push({ t: time, y: yPercent });
        if (time - swipeData.current.history[0].t > 1000) {
            swipeData.current.history.shift(); // Keep only last ~1 second
        }

        swipeData.current.minY = Math.min(swipeData.current.minY, yPercent);
        swipeData.current.maxY = Math.max(swipeData.current.maxY, yPercent);
        swipeData.current.totalDistance += dy;
        swipeData.current.lastY = yPercent;
        swipeData.current.lastTime = time;

        setCurrentY(yPercent);
        setVisualPos(100 - yPercent);
    };

    const handlePointerUp = async (e) => {
        if (!isSwiping) return;
        setIsSwiping(false);

        if (e && e.target && e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) {
            e.target.releasePointerCapture(e.pointerId);
        }

        const duration = (performance.now() - swipeData.current.startTime) / 1000;
        if (duration < 0.1 || swipeData.current.totalDistance < 5) {
            return;
        }

        const newMax = 100 - swipeData.current.minY;
        const newMin = 100 - swipeData.current.maxY;

        // The Handy essentially operates on a "Time to reach target" curve based on the velocity %.
        // A simple, pure mapping of our finger swipe speed (percent of stroke per second) 
        // directly scaled to the 0-100 API limit is much more predictable than complex windowing.
        const distanceSwiped = swipeData.current.totalDistance; // Total % moved

        // Let's say a "100% velocity" swipe is covering 200% of the entire track in 1 second.
        // It means swiping top-to-bottom (100% distance) in 0.5 seconds = 100% velocity.
        // Swiping top-to-bottom in 1.0 second = 50% velocity.
        const speedPercentPerSec = distanceSwiped / duration;

        const calculatedVelocity = Math.round((speedPercentPerSec / 200) * 100);
        const normalizedVelocity = Math.min(100, Math.max(5, calculatedVelocity));

        const finalMin = Math.round(Math.max(0, newMin || 0));
        const finalMax = Math.round(Math.min(100, newMax || 100));

        const newPattern = {
            min: finalMin,
            max: Math.max(finalMin + 5, finalMax),
            velocity: Number.isNaN(normalizedVelocity) ? 50 : normalizedVelocity
        };

        setPattern(newPattern);

        const fingerReleaseY = 100 - swipeData.current.lastY;

        if (isRecording && recordStartTimeRef.current) {
            // Record this pattern event relative to the start of the 10s window
            const relativeTime = performance.now() - recordStartTimeRef.current;
            if (relativeTime <= 10000) {
                loopSequenceRef.current.push({
                    relativeTime,
                    min: newPattern.min,
                    max: newPattern.max,
                    velocity: newPattern.velocity,
                    lastTargetY: swipeData.current.lastY
                });
                setSequenceCount(loopSequenceRef.current.length);
            }
        }

        // Sync visual indicator's starting point exactly to the finger release position
        setVisualPos(Math.min(newPattern.max, Math.max(newPattern.min, fingerReleaseY)));

        // Predict initial physical direction based on the last recorded finger movement
        if (swipeData.current.history.length >= 2) {
            const lastFrame = swipeData.current.history[swipeData.current.history.length - 1];
            const prevFrame = swipeData.current.history[swipeData.current.history.length - 2];
            // Since Screen Y is Top-to-Bottom, and Handy Y is Bottom-to-Top:
            // Screen Y increasing (moving down) means Handy Y should decrease (moving towards min)
            animDirection.current = lastFrame.y > prevFrame.y ? -1 : 1;
        }

        if (active) {
            await setSlide(connectionKey, newPattern.min, newPattern.max);
            await setHampVelocity(connectionKey, newPattern.velocity);
        }
    };

    return (
        <div className="screen-container" style={{ padding: '1rem', display: 'flex' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'var(--color-bg-surface)', padding: '1rem', borderRadius: 'var(--border-radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity color="var(--color-accent)" />
                    <span style={{ fontWeight: 'bold' }}>Pattern: {pattern.min}% - {pattern.max}%</span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    Speed: {pattern.velocity}%
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '2rem 0' }}>



                {/* The Pillar Container (Tech Fader Track) */}
                <div
                    ref={pillarRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    style={{
                        width: '60px',
                        height: '100%',
                        background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                        borderRadius: '12px',
                        border: '2px solid rgba(148, 163, 184, 0.2)',
                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
                        position: 'relative',
                        touchAction: 'none',
                        cursor: 'ns-resize'
                    }}
                >
                    {/* Active Area Indicator Background (Rail Energy) */}
                    {!isSwiping && (
                        <div style={{
                            position: 'absolute',
                            bottom: `${pattern.min}%`,
                            height: `${pattern.max - pattern.min}%`,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '4px',
                            background: 'var(--color-accent)',
                            boxShadow: '0 0 10px var(--color-accent-glow)',
                            pointerEvents: 'none',
                            transition: 'all 0.3s ease'
                        }} />
                    )}

                    {/* The Moving Indicator (Fader Knob) */}
                    <div style={{
                        position: 'absolute',
                        bottom: `${visualPos}%`,
                        left: '50%',
                        transform: 'translate(-50%, 50%)',
                        width: '80px',
                        height: '30px',
                        background: isSwiping ? '#e2e8f0' : (active ? 'var(--color-bg-surface)' : '#334155'),
                        borderRadius: '8px',
                        border: `2px solid ${isSwiping ? '#fff' : (active ? 'var(--color-accent)' : '#94a3b8')}`,
                        boxShadow: isSwiping
                            ? '0 0 20px rgba(255, 255, 255, 0.4)'
                            : (active ? '0 0 20px var(--color-accent-glow)' : '0 4px 6px rgba(0,0,0,0.3)'),
                        transition: isSwiping ? 'none' : 'box-shadow 0.3s ease, border-color 0.3s ease',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10
                    }}>
                        {/* Grip Lines */}
                        <div style={{
                            display: 'flex',
                            gap: '4px'
                        }}>
                            <div style={{ width: '2px', height: '12px', background: isSwiping ? '#94a3b8' : (active ? 'var(--color-accent)' : '#cbd5e1'), borderRadius: '1px' }} />
                            <div style={{ width: '2px', height: '12px', background: isSwiping ? '#94a3b8' : (active ? 'var(--color-accent)' : '#cbd5e1'), borderRadius: '1px' }} />
                            <div style={{ width: '2px', height: '12px', background: isSwiping ? '#94a3b8' : (active ? 'var(--color-accent)' : '#cbd5e1'), borderRadius: '1px' }} />
                        </div>
                    </div>

                    {/* Recording Countdown */}
                    <div style={{
                        position: 'absolute',
                        top: '-70px',
                        left: '-80px',
                        right: '-80px',
                        textAlign: 'center',
                        color: 'var(--color-error)',
                        fontWeight: 'bold',
                        fontSize: '1.25rem',
                        opacity: countdown !== null ? 1 : 0,
                        transition: 'opacity 0.2s',
                        textShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                        pointerEvents: 'none'
                    }}>
                        {countdown !== null ? `Recording: ${countdown}s` : ''}
                    </div>

                    <div style={{ position: 'absolute', top: '-35px', left: '-40px', right: '-40px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.8rem', pointerEvents: 'none', fontWeight: 600, textTransform: 'uppercase' }}>Track Control</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto' }}>
                <button
                    onClick={onDisconnect}
                    className="btn-primary"
                    style={{ background: 'rgba(255,255,255,0.1)', flex: 0.5 }}
                >
                    Trennen
                </button>
                <div style={{ flex: 1.5, display: 'flex', gap: '0.5rem' }}>
                    {/* Record Button */}
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!active || isPlaying}
                        style={{
                            width: '50px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-bg-surface)',
                            border: `1px solid ${isRecording ? 'var(--color-error)' : 'rgba(255,255,255,0.1)'}`,
                            color: isRecording ? 'var(--color-error)' : (active && !isPlaying ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                            borderRadius: 'var(--border-radius-pill)',
                            opacity: (!active || isPlaying) ? 0.5 : 1,
                            transition: 'all 0.3s ease'
                        }}
                        title="Record 10s pattern"
                    >
                        {isRecording ? <Square size={18} fill="currentColor" /> : <Circle size={18} fill="currentColor" />}
                    </button>

                    {/* Play Button */}
                    <button
                        onClick={isPlaying ? stopPlayback : startPlayback}
                        disabled={!active || isRecording || sequenceCount === 0}
                        style={{
                            width: '50px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isPlaying ? 'rgba(16, 185, 129, 0.2)' : 'var(--color-bg-surface)',
                            border: `1px solid ${isPlaying ? 'var(--color-success)' : 'rgba(255,255,255,0.1)'}`,
                            color: isPlaying ? 'var(--color-success)' : (active && !isRecording && sequenceCount > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                            borderRadius: 'var(--border-radius-pill)',
                            opacity: (!active || isRecording || sequenceCount === 0) ? 0.5 : 1,
                            transition: 'all 0.3s ease'
                        }}
                        title={sequenceCount > 0 ? "Play recorded pattern" : "No pattern recorded"}
                    >
                        {isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </button>

                    <button
                        onClick={toggleActive}
                        className="btn-primary"
                        style={{
                            flex: 1,
                            background: active ? 'var(--color-error)' : 'var(--color-success)',
                            boxShadow: active ? '0 4px 14px 0 rgba(239, 68, 68, 0.5)' : '0 4px 14px 0 rgba(16, 185, 129, 0.5)',
                        }}
                    >
                        <Power size={20} />
                        {active ? 'Stop' : 'Start'}
                    </button>
                </div>
            </div>
        </div >
    );
}
