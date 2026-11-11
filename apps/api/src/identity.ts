import { OidcJwksVerifier } from '../../../packages/cloud-core/src/auth';
import type { CloudApiConfig, CloudIdentityVerifier } from './ports';

export function createOidcIdentityVerifier(
  config: Pick<CloudApiConfig, 'issuer' | 'audience' | 'jwksUrl'>
): CloudIdentityVerifier {
  return new OidcJwksVerifier({
    issuer: config.issuer,
    audience: config.audience,
    jwksUrl: config.jwksUrl,
  });
}
