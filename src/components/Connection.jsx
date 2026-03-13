import React, { useState } from 'react';
import { checkConnection } from '../api/handy';
import { Wifi, Webhook, Loader2 } from 'lucide-react';

export default function Connection({ onConnected }) {
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!key.trim()) return;

        setLoading(true);
        setError(null);

        const isConnected = await checkConnection(key.trim());

        setLoading(false);
        if (isConnected) {
            onConnected(key.trim());
        } else {
            setError("Verbindung fehlgeschlagen. Bitte prüfe deinen Connection Key und ob dein Handy online ist.");
        }
    };

    return (
        <div className="screen-container" style={{ justifyContent: 'center' }}>
            <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto', width: '100%' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
                        <Webhook size={48} color="var(--color-accent)" />
                    </div>
                    <h1>Handyverse</h1>
                    <p>Verbinde dich mit deinem Handy</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <input
                            type="text"
                            placeholder="Connection Key"
                            className="input-field"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            disabled={loading}
                            autoComplete="off"
                        />
                    </div>

                    {error && <div style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</div>}

                    <button type="submit" className="btn-primary" disabled={loading || !key.trim()}>
                        {loading ? <Loader2 className="spin" /> : <Wifi />}
                        {loading ? "Verbinden..." : "Verbinden"}
                    </button>
                </form>
            </div>
        </div>
    );
}
