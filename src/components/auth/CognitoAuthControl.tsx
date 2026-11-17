import React from 'react';
import { getCognitoAuthClient } from '../../services/auth/cognito';
import { careerOpsCloudApi } from '../../services/cloudApi/careerOpsClient';

export function CognitoAuthControl() {
  const client = getCognitoAuthClient();
  const [signedIn, setSignedIn] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [apiConnected, setApiConnected] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!client) return;
      try {
        if (window.location.pathname === '/auth/callback') {
          await client.completeCallback();
          if (active) setSignedIn(true);
          if (careerOpsCloudApi) {
            await careerOpsCloudApi.request('/v1/me');
            if (active) setApiConnected(true);
          }
        } else {
          const token = await client.getAccessToken();
          if (active) setSignedIn(Boolean(token));
          if (token && careerOpsCloudApi) {
            await careerOpsCloudApi.request('/v1/me');
            if (active) setApiConnected(true);
          }
        }
      } catch {
        if (active) setMessage('Sign-in could not be completed. Please try again.');
        window.history.replaceState({}, document.title, '/');
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [client]);

  if (!client) return null;
  const inElectron = Boolean(window.electronAPI);

  const style: React.CSSProperties = {
    border: '1px solid #343B4A',
    borderRadius: 6,
    padding: '5px 9px',
    color: '#D9E0EF',
    background: '#171B24',
    fontSize: 11,
    fontWeight: 600,
    cursor: inElectron ? 'not-allowed' : 'pointer',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {message && (
        <span role="status" style={{ color: '#F1A3A3', fontSize: 10 }}>
          {message}
        </span>
      )}
      {signedIn ? (
        <>
          <span style={{ color: apiConnected ? '#86D6A5' : '#E5B86A', fontSize: 10 }}>
            {apiConnected ? 'Cloud connected' : 'Signed in · API not verified'}
          </span>
          <button
            type="button"
            style={style}
            onClick={() => {
              setApiConnected(false);
              setSignedIn(false);
              client.signOut();
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          style={style}
          disabled={inElectron}
          title={
            inElectron
              ? 'Web Cognito callback is not configured for the desktop app yet'
              : 'Sign in to CareerOps Cloud'
          }
          onClick={() => {
            setMessage('');
            void client.signIn().catch(() => setMessage('Could not start Cognito sign-in.'));
          }}
        >
          Sign in to Cloud
        </button>
      )}
    </div>
  );
}
