# CareerOps Cognito authentication

CareerOps uses Cognito User Pools with the OAuth 2.0 authorization-code flow and PKCE (S256). The browser app is a public client: **do not create or ship a client secret**.

## Existing pool values

- Region: `ap-southeast-2`
- User pool: `ap-southeast-2_fhknKz871`
- Issuer: `https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fhknKz871`
- JWKS: `https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fhknKz871/.well-known/jwks.json`
- App client ID: `3pjaus5ndmnhvp1mo4i6o0keu8`

## Cognito app client settings

Configure a public app client with:
- OAuth grant: Authorization code grant
- PKCE: required / S256
- Scopes: `openid`, `email`, `profile`
- No client secret
- Callback URL: `https://main.d37etc5h2drv5h.amplifyapp.com/auth/callback`
- Sign-out URL: `https://main.d37etc5h2drv5h.amplifyapp.com/`

The sample CloudFront URL in the AWS tutorial is not a CareerOps callback. Register the exact URLs above in the app client. If the Amplify hostname changes, update both Cognito and Amplify environment variables.

## Cognito hosted UI domain is still required

The supplied Cognito managed-login domain is `https://ap-southeast-2fhknkz871.auth.ap-southeast-2.amazoncognito.com`. Set this exact value as `VITE_COGNITO_DOMAIN`. The OIDC issuer and JWKS remain the separate `cognito-idp` endpoints listed above.

## Amplify build environment

Set these variables in Amplify app build settings:

```text
VITE_COGNITO_DOMAIN=https://<your-cognito-domain>
VITE_COGNITO_CLIENT_ID=3pjaus5ndmnhvp1mo4i6o0keu8
VITE_COGNITO_ISSUER=https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fhknKz871
VITE_COGNITO_REDIRECT_URI=https://main.d37etc5h2drv5h.amplifyapp.com/auth/callback
VITE_COGNITO_LOGOUT_URI=https://main.d37etc5h2drv5h.amplifyapp.com/
VITE_CAREEROPS_API_URL=https://<your-api-host>
```

Only public identifiers and URLs belong in `VITE_*` variables. Never put client secrets, API keys, database credentials, signing secrets, or AWS credentials in Vite variables.

## API container environment

Configure the API secret/environment with:

```text
CAREEROPS_JWT_ISSUER=https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fhknKz871
CAREEROPS_JWT_AUDIENCE=3pjaus5ndmnhvp1mo4i6o0keu8
CAREEROPS_JWKS_URL=https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fhknKz871/.well-known/jwks.json
CAREEROPS_CORS_ALLOWED_ORIGINS=https://main.d37etc5h2drv5h.amplifyapp.com
```

The API verifier accepts Cognito access tokens only (`token_use=access` and matching `client_id`). It rejects ID tokens as API bearer credentials. User identity is the immutable Cognito `sub`; tenant membership remains server-resolved.

## Current boundaries

- Browser access tokens remain in memory; a page reload requires a fresh sign-in. No tokens are stored in localStorage or cookies.
- Electron desktop OAuth callback/deep-link handling is not enabled by this web flow.
- The API client is constructed with the Cognito token provider, but cloud product endpoints still need to be wired feature-by-feature.
- No AWS resources were created or changed by this code change.
