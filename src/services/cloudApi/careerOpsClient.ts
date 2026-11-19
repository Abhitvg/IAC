import { createCareerOpsApiClient } from './client';
import { getCognitoAuthClient } from '../auth/cognito';

const apiBaseUrl = import.meta.env.VITE_CAREEROPS_API_URL;

export const careerOpsCloudApi =
  typeof apiBaseUrl === 'string' && apiBaseUrl.length > 0
    ? createCareerOpsApiClient({
        baseUrl: apiBaseUrl,
        getAccessToken: async () => getCognitoAuthClient()?.getAccessToken() ?? null,
      })
    : null;
