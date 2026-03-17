import React, { useState, useRef, useEffect } from 'react';
import {
    setSlide,
    setHampVelocity,
    setMode,
    startHampMotion,
    stopHampMotion,
    checkConnection
} from '../api/handy';
import { Play, Square, Circle, Activity, RefreshCw, XCircle, Power, WifiOff } from 'lucide-react';

export default function PillarControl({ connectionKey, onDisconnect, onIntensityChange, connectionLost, setConnectionLost }) {
    const [active, setActive] = useState(false);
    const [settingUp, setSettingUp] = useState(false);

    // Drag state
    const [isSwiping, setIsSwiping] = useState(false);
    const [currentY, setCurrentY] = useState(0); // visual y percentage
    const [pattern, setPattern] = useState({ min: 0, max: 100, velocity: 50 });
    const patternRef = useRef(pattern); // Keep an instant sync reference for closures/rapid events

    // Initial hardware sync on mount
    useEffect(() => {
        let mounted = true;
        const initializeHardwareToBase = async () => {
            if (!connectionKey) return;
            // Set device to mode 2 (HAMP)
            const modeOk = await setMode(connectionKey, 2);
            if (modeOk && mounted) {
                // To actually force it to the bottom, we must set a tight 0-0 boundary
                await setSlide(connectionKey, 0, 0);
                await setHampVelocity(connectionKey, 100); 
                // Start the motion briefly so it travels there, then stop it
                await startHampMotion(connectionKey);
                
                setTimeout(async () => {
                    if (!mounted) return;
                    await stopHampMotion(connectionKey);
                    // Reset to the full track boundary at a baseline speed for when the user takes over
                    await setSlide(connectionKey, 0, 100);
                    await setHampVelocity(connectionKey, 50);
                }, 500); // 500ms is enough for the motor to bottom out
            }
        };
        initializeHardwareToBase();
        return () => { mounted = false; };
    }, [connectionKey]);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [countdown, setCountdown] = useState(null);

    // Refs for real-time state access in closures (setTimeout loops)
    const activeRef = useRef(active);
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { activeRef.current = active; }, [active]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    // Use ref for sequence so setTimeout closures in playLoop don't read stale empty arrays
    const loopSequenceRef = useRef([]);
    const [sequenceCount, setSequenceCount] = useState(0); // For UI reactiveness

    // Refs for recording/playback timing
    const recordStartTimeRef = useRef(null);
    const recordedDurationRef = useRef(0);
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
    const [visualPos, setVisualPos] = useState(0);
    const animDirection = useRef(1);

    // Speed Slider State & Refs
    const speedTrackRef = useRef(null);
    const [isDraggingSpeed, setIsDraggingSpeed] = useState(false);
    const draggedVelocityRef = useRef(pattern.velocity);

    const handleSpeedPointerDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!speedTrackRef.current) return;
        e.target.setPointerCapture(e.pointerId);
        setIsDraggingSpeed(true);
        updateSpeedFromPointer(e);
    };

    const handleSpeedPointerMove = (e) => {
        if (!isDraggingSpeed) return;
        e.preventDefault();
        e.stopPropagation();
        updateSpeedFromPointer(e);
    };

    const handleSpeedPointerUp = async (e) => {
        if (!isDraggingSpeed) return;
        setIsDraggingSpeed(false);
        if (e && e.target && e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) {
            e.target.releasePointerCapture(e.pointerId);
        }

        if (isRecording && recordStartTimeRef.current) {
            const relativeTime = performance.now() - recordStartTimeRef.current;
            loopSequenceRef.current.push({
                relativeTime,
                min: patternRef.current.min,
                max: patternRef.current.max,
                velocity: draggedVelocityRef.current,
                lastTargetY: 100 - visualPos
            });
            setSequenceCount(loopSequenceRef.current.length);
        }

        if (active) {
            const success = await setHampVelocity(connectionKey, draggedVelocityRef.current);
            if (!success && setConnectionLost) setConnectionLost(true);
        }
    };

    const updateSpeedFromPointer = (e) => {
        if (!speedTrackRef.current) return;
        const rect = speedTrackRef.current.getBoundingClientRect();
        let yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        yPercent = Math.max(0, Math.min(100, yPercent));
        const newVelocity = Math.round(100 - yPercent);
        const safeVelocity = Math.max(0, Math.min(100, newVelocity));
        
        draggedVelocityRef.current = safeVelocity;
        const newPattern = { ...patternRef.current, velocity: safeVelocity };
        patternRef.current = newPattern;
        setPattern(newPattern);
    };

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
                // Adjusted the multiplier to ~400 to hit the perfect sweet spot between the app and the physical device.
                const speedPercentPerSec = (pattern.velocity / 100) * 400;
                const distancePerFrame = Math.max(10, speedPercentPerSec) * (dt / 1000); // 10% minimum speed to prevent getting stuck

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
            if (isPlaying) stopPlayback();
        } else {
            // Start flow: Set Mode HAMP (2) -> Set default Slide -> Start Motion -> Set default velocity
            const modeOk = await setMode(connectionKey, 2); // HAMP mode
            if (modeOk) {
                await setSlide(connectionKey, pattern.min, pattern.max);
                await startHampMotion(connectionKey);
                await setHampVelocity(connectionKey, pattern.velocity);
                activeRef.current = true; // Synchronous update for immediate playLoop access
                setActive(true);
            } else {
                alert("Konnte den Modus nicht ändern. Ist das Handy online?");
            }
        }
        setSettingUp(false);
    };

    const startRecording = () => {
        if (isPlaying || settingUp) return;
        loopSequenceRef.current = [];
        setSequenceCount(0);
        recordedDurationRef.current = 0;
        setIsRecording(true);
        recordStartTimeRef.current = performance.now();
    };

    const stopRecording = () => {
        if (!isRecording) return;
        
        setIsRecording(false);
        const endTime = performance.now();
        // Calculate total recorded duration
        if (recordStartTimeRef.current) {
            recordedDurationRef.current = endTime - recordStartTimeRef.current;
        }
        
        recordStartTimeRef.current = null;

        // Normalize timestamps so the first recorded event triggers immediately on playback (t=0)
        // We also adjust the total recorded duration to account for this cropped start time
        if (loopSequenceRef.current.length > 0) {
            const firstTime = loopSequenceRef.current[0].relativeTime;
            if (firstTime > 0) {
                loopSequenceRef.current = loopSequenceRef.current.map(event => ({
                    ...event,
                    relativeTime: Math.max(0, event.relativeTime - firstTime)
                }));
                recordedDurationRef.current = Math.max(10, recordedDurationRef.current - firstTime);
            }
        }
    };

    const startPlayback = () => {
        if (isRecording || loopSequenceRef.current.length === 0) return;
        
        // Auto-start device if playing back while not active
        if (!active && !settingUp) {
            setIsPlaying(true);
            isPlayingRef.current = true; // Synchronous update
            toggleActive().then(() => {
                playLoop(); 
            });
            return;
        }

        setIsPlaying(true);
        isPlayingRef.current = true; // Synchronous update
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

        // Schedule all API calls using the ref
        loopSequenceRef.current.forEach((event) => {
            const timeoutId = setTimeout(async () => {
                // Use refs to check current state, avoiding stale closure variables
                if (!activeRef.current && !isPlayingRef.current) return; 
                
                const newPattern = { min: event.min, max: event.max, velocity: event.velocity };
                patternRef.current = newPattern;
                setPattern(newPattern);

                // Jump visual indicator roughly to the start of this pattern
                setVisualPos(Math.min(event.max, Math.max(event.min, 100 - event.lastTargetY)));

                if (activeRef.current) {
                    const slideOk = await setSlide(connectionKey, event.min, event.max);
                    if (!slideOk && setConnectionLost) {
                        setConnectionLost(true);
                        return; // Stop processing further async calls in this loop
                    }
                    
                    const velOk = await setHampVelocity(connectionKey, event.velocity);
                    if (!velOk && setConnectionLost) {
                        setConnectionLost(true);
                    }
                }
            }, event.relativeTime);
            playbackTimeoutsRef.current.push(timeoutId);
        });

        // Re-trigger loop after the exact recorded duration (minimum 1 second to prevent immediate loops)
        const loopDuration = Math.max(1000, recordedDurationRef.current);
        playbackTimerRef.current = setTimeout(() => {
            if (isPlayingRef.current) {
                playLoop();
            }
        }, loopDuration);
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

        patternRef.current = newPattern;
        setPattern(newPattern);

        const fingerReleaseY = 100 - swipeData.current.lastY;

        if (isRecording && recordStartTimeRef.current) {
            // Record this pattern event relative to the start
            const relativeTime = performance.now() - recordStartTimeRef.current;
            loopSequenceRef.current.push({
                relativeTime,
                min: newPattern.min,
                max: newPattern.max,
                velocity: newPattern.velocity,
                lastTargetY: swipeData.current.lastY
            });
            setSequenceCount(loopSequenceRef.current.length);
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

        if (activeRef.current) {
            const slideOk = await setSlide(connectionKey, newPattern.min, newPattern.max);
            if (!slideOk && setConnectionLost) {
                setConnectionLost(true);
                return;
            }
            
            const velOk = await setHampVelocity(connectionKey, newPattern.velocity);
            if (!velOk && setConnectionLost) setConnectionLost(true);
        }
    };

    // Added `connectionLost` check to stop any background loops if connection dies unexpectedly
    useEffect(() => {
        if (connectionLost) {
            setIsPlaying(false);
            setIsRecording(false);
            if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
            playbackTimeoutsRef.current.forEach(clearTimeout);
            playbackTimeoutsRef.current = [];
        }
    }, [connectionLost]);

    return (
        <div className="screen-container" style={{ padding: '1rem', display: 'flex', position: 'relative' }}>
            {/* Connection Lost Overlay */}
            {connectionLost && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(2, 6, 23, 0.8)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '16px',
                    padding: '2rem',
                    textAlign: 'center'
                }}>
                    <WifiOff size={48} color="var(--color-error)" style={{ marginBottom: '1rem' }} />
                    <h2 style={{ color: 'var(--color-error)', margin: '0 0 1rem 0' }}>Verbindung verloren</h2>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', maxWidth: '300px' }}>
                        Die Verbindung zu deinem Handyfeeling-Gerät wurde unerwartet getrennt. Bitte prüfe dein WLAN oder den Gerätestatus.
                    </p>
                    <button
                        onClick={onDisconnect}
                        className="btn-primary"
                        style={{ padding: '0.75rem 2rem' }}
                    >
                        Neu verbinden
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'var(--color-bg-surface)', padding: '1rem', borderRadius: 'var(--border-radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity color="var(--color-accent)" />
                    <span style={{ fontWeight: 'bold' }}>Pattern: {pattern.min}% - {pattern.max}%</span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    Speed: {pattern.velocity}%
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '3rem', margin: '2rem 0' }}>

                {/* Main Pillar Wrapper */}
                <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Recording Indicator */}
                    <div style={{
                        position: 'absolute',
                        top: '-70px',
                        width: '200px',
                        textAlign: 'center',
                        color: 'var(--color-error)',
                        fontWeight: 'bold',
                        fontSize: '1.25rem',
                        opacity: isRecording ? 1 : 0,
                        transition: 'opacity 0.2s',
                        textShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                        pointerEvents: 'none',
                        animation: isRecording ? 'pulse 1.5s infinite' : 'none'
                    }}>
                        ⬤ Recording
                    </div>

                    <div style={{ position: 'absolute', top: '-35px', width: '200px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.8rem', pointerEvents: 'none', fontWeight: 600, textTransform: 'uppercase' }}>Track Control</div>
                    
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
                        {/* Inner 75% Red Column */}
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '75%',
                            backgroundColor: 'rgba(239, 68, 68, 0.4)', // semi-transparent red
                            borderBottomLeftRadius: '10px',
                            borderBottomRightRadius: '10px',
                            pointerEvents: 'none',
                            zIndex: 1
                        }} />

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
                                transition: 'all 0.3s ease',
                                zIndex: 2
                            }} />
                        )}

                        {/* The Moving Indicator (Fader Knob / Sleeve) */}
                        <div style={{
                            position: 'absolute',
                            bottom: `${visualPos}%`,
                            left: '50%',
                            // Dynamic translation: 0% at bottom (hard cut) -> 75% at top (25% overhang)
                            transform: `translate(-50%, ${(visualPos / 100) * 75}%)`,
                            width: '80px',
                            height: '25%', // Exactly 25% of the pillar's height
                            background: isSwiping ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                            borderRadius: '8px',
                            border: `3px solid ${isSwiping ? '#fff' : (active ? 'var(--color-accent)' : '#94a3b8')}`,
                            boxShadow: isSwiping
                                ? '0 0 20px rgba(255, 255, 255, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.2)'
                                : (active ? '0 0 15px var(--color-accent-glow), inset 0 0 10px var(--color-accent-glow)' : '0 4px 6px rgba(0,0,0,0.3)'),
                            transition: isSwiping ? 'none' : 'box-shadow 0.3s ease, border-color 0.3s ease',
                            pointerEvents: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10,
                            backdropFilter: 'blur(2px)' // subtle glass effect inside the ring
                        }}>
                            {/* Empty inside to look like a ring/sleeve, adding tiny grip indicators on the sides */}
                            <div style={{ position: 'absolute', left: '-2px', width: '4px', height: '16px', background: isSwiping ? '#fff' : (active ? 'var(--color-accent)' : '#94a3b8'), borderRadius: '2px' }} />
                            <div style={{ position: 'absolute', right: '-2px', width: '4px', height: '16px', background: isSwiping ? '#fff' : (active ? 'var(--color-accent)' : '#94a3b8'), borderRadius: '2px' }} />
                        </div>
                    </div>
                </div>

                {/* Speed Slider Wrapper */}
                <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ position: 'absolute', top: '-35px', width: '100px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.8rem', pointerEvents: 'none', fontWeight: 600, textTransform: 'uppercase' }}>Speed</div>

                    <div
                        ref={speedTrackRef}
                        onPointerDown={handleSpeedPointerDown}
                        onPointerMove={handleSpeedPointerMove}
                        onPointerUp={handleSpeedPointerUp}
                        onPointerCancel={handleSpeedPointerUp}
                        onPointerLeave={handleSpeedPointerUp}
                        style={{
                            width: '8px',
                            height: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '4px',
                            position: 'relative',
                            touchAction: 'none',
                            cursor: 'ns-resize'
                        }}
                    >
                        {/* Speed Level Indicator Fill */}
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: '0',
                            width: '100%',
                            height: `${pattern.velocity}%`,
                            background: 'linear-gradient(0deg, var(--color-success) 0%, var(--color-accent) 50%, var(--color-error) 100%)',
                            borderRadius: '4px',
                            pointerEvents: 'none',
                            transition: isDraggingSpeed ? 'none' : 'height 0.2s ease'
                        }} />

                        {/* Speed Knob */}
                        <div style={{
                            position: 'absolute',
                            bottom: `${pattern.velocity}%`,
                            left: '50%',
                            transform: 'translate(-50%, 50%)',
                            width: '24px',
                            height: '24px',
                            background: isDraggingSpeed ? '#fff' : (active ? 'var(--color-bg-surface)' : '#334155'),
                            borderRadius: '50%',
                            border: `2px solid ${isDraggingSpeed ? '#fff' : (active ? 'var(--color-accent)' : '#94a3b8')}`,
                            boxShadow: isDraggingSpeed
                                ? '0 0 10px rgba(255, 255, 255, 0.8)'
                                : (active ? '0 0 10px var(--color-accent-glow)' : '0 2px 4px rgba(0,0,0,0.3)'),
                            transition: isDraggingSpeed ? 'none' : 'box-shadow 0.3s ease, border-color 0.3s ease, bottom 0.2s ease',
                            pointerEvents: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10
                        }} />
                    </div>
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
                        disabled={isPlaying || settingUp}
                        style={{
                            width: '50px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-bg-surface)',
                            border: `1px solid ${isRecording ? 'var(--color-error)' : 'rgba(255,255,255,0.1)'}`,
                            color: isRecording ? 'var(--color-error)' : (!isPlaying && !settingUp ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                            borderRadius: 'var(--border-radius-pill)',
                            opacity: (isPlaying || settingUp) ? 0.5 : 1,
                            transition: 'all 0.3s ease'
                        }}
                        title="Record pattern"
                    >
                        {isRecording ? <Square size={18} fill="currentColor" /> : <Circle size={18} fill="currentColor" />}
                    </button>

                    {/* Play Button */}
                    <button
                        onClick={isPlaying ? stopPlayback : startPlayback}
                        disabled={isRecording || sequenceCount === 0 || settingUp}
                        style={{
                            width: '50px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isPlaying ? 'rgba(16, 185, 129, 0.2)' : 'var(--color-bg-surface)',
                            border: `1px solid ${isPlaying ? 'var(--color-success)' : 'rgba(255,255,255,0.1)'}`,
                            color: isPlaying ? 'var(--color-success)' : (!isRecording && sequenceCount > 0 && !settingUp ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                            borderRadius: 'var(--border-radius-pill)',
                            opacity: (isRecording || sequenceCount === 0 || settingUp) ? 0.5 : 1,
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
