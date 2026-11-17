import { describe, expect, it } from 'vitest';
import { CognitoAuthClient } from '../src/services/auth/cognito';

describe('Cognito URL validation', () => {
  const validConfig = {
    domain: 'https://example.auth.ap-southeast-2.amazoncognito.com',
    clientId: 'public-client-id',
    redirectUri: 'https://app.example.com/auth/callback',
    logoutUri: 'https://app.example.com/',
  };

  it('accepts HTTPS Cognito and callback URLs', () => {
    expect(() => new CognitoAuthClient(validConfig)).not.toThrow();
  });

  it('allows HTTP only for localhost development URLs', () => {
    expect(
      () =>
        new CognitoAuthClient({
          ...validConfig,
          redirectUri: 'http://localhost:5173/auth/callback',
          logoutUri: 'http://127.0.0.1:5173/',
        })
    ).not.toThrow();
  });

  it('rejects non-HTTPS schemes even when the hostname is localhost', () => {
    expect(
      () =>
        new CognitoAuthClient({
          ...validConfig,
          redirectUri: 'ftp://localhost/auth/callback',
        })
    ).toThrow('must use HTTPS');
  });

  it('rejects HTTP URLs outside localhost', () => {
    expect(
      () =>
        new CognitoAuthClient({
          ...validConfig,
          logoutUri: 'http://app.example.com/',
        })
    ).toThrow('must use HTTPS');
  });

  it('rejects URLs containing query strings or fragments', () => {
    expect(
      () =>
        new CognitoAuthClient({
          ...validConfig,
          redirectUri: 'https://app.example.com/auth/callback?next=/',
        })
    ).toThrow('is invalid');
    expect(
      () =>
        new CognitoAuthClient({
          ...validConfig,
          logoutUri: 'https://app.example.com/#fragment',
        })
    ).toThrow('is invalid');
  });
});
