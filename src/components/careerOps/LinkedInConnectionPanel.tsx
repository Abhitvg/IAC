import React, { useCallback, useEffect, useMemo, useState } from 'react';

type CapabilityStatus =
  | 'available'
  | 'needs_member_authorization'
  | 'needs_linkedin_product_approval'
  | 'needs_partner_approval'
  | 'not_implemented';

interface LinkedInCapability {
  id: string;
  status: CapabilityStatus;
  reason: string;
}

interface LinkedInStatus {
  connected: boolean;
  scheduledPublishingEnabled?: boolean;
  expiresAt: number | null;
  capabilities: LinkedInCapability[];
  entitlements?: {
    communityManagementApproved?: boolean;
    communicationsApiApproved?: boolean;
    invitationsApiApproved?: boolean;
    messagesApiApproved?: boolean;
  };
}

interface ScheduledPostItem {
  id: string;
  commentary: string;
  scheduledAt: string;
  status: 'scheduled' | 'processing' | 'published' | 'failed' | 'cancelled' | 'unknown_outcome' | 'needs_review';
  attemptCount: number;
  publishedPostUrn: string | null;
  errorCode: string | null;
}

interface TenantControls {
  globalKillSwitch: boolean;
  pausedChannels: string[];
}

interface MemberInfo {
  role: string;
}

type ApiMethod = 'GET' | 'POST' | 'DELETE';
type ReactionType = 'LIKE' | 'PRAISE' | 'EMPATHY' | 'INTEREST' | 'APPRECIATION' | 'ENTERTAINMENT';

interface ApiEnvelope {
  status: number;
  body: unknown;
}

interface LinkedInConnectionPanelProps {
  initialDraft?: string;
}

const REACTIONS: ReactionType[] = [
  'LIKE',
  'PRAISE',
  'EMPATHY',
  'INTEREST',
  'APPRECIATION',
  'ENTERTAINMENT',
];

const panelStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,.72)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 12,
  padding: 16,
  display: 'grid',
  gap: 10,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.14)',
  padding: '9px 10px',
  color: '#f8fafc',
  background: '#0b1220',
  font: 'inherit',
  fontSize: 12,
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.16)',
  borderRadius: 8,
  padding: '8px 11px',
  color: '#e2e8f0',
  background: 'rgba(255,255,255,.07)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
};

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string' && error.length <= 500) return error;
  }
  return fallback;
}

function capabilityLabel(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function capabilityState(status: CapabilityStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'needs_member_authorization':
      return 'Member authorization required';
    case 'needs_linkedin_product_approval':
      return 'LinkedIn product approval required';
    case 'needs_partner_approval':
      return 'LinkedIn partner approval required';
    case 'not_implemented':
      return 'Not implemented';
  }
}

function isSecureApiOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '/' || url.pathname === '')
    );
  } catch {
    return false;
  }
}

export function LinkedInConnectionPanel({ initialDraft = '' }: LinkedInConnectionPanelProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [cloudToken, setCloudToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [controls, setControls] = useState<TenantControls | null>(null);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [postText, setPostText] = useState(initialDraft);
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPostItem[]>([]);
  const [scheduleIdempotencyKey, setScheduleIdempotencyKey] = useState('');
  const [commentTarget, setCommentTarget] = useState('');
  const [commentObject, setCommentObject] = useState('');
  const [commentText, setCommentText] = useState('');
  const [reactionRoot, setReactionRoot] = useState('');
  const [reactionEntity, setReactionEntity] = useState('');
  const [reactionType, setReactionType] = useState<ReactionType>('LIKE');
  const [organizationUrn, setOrganizationUrn] = useState('');
  const [organizationPostText, setOrganizationPostText] = useState('');
  const [organizationCommentTarget, setOrganizationCommentTarget] = useState('');
  const [organizationCommentObject, setOrganizationCommentObject] = useState('');
  const [organizationCommentText, setOrganizationCommentText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setPostText(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    let active = true;
    const loadLocalConfig = async () => {
      try {
        const [settings, hasToken] = await Promise.all([
          window.electronAPI.getSettings(),
          window.electronAPI.hasApiKey('careerops-cloud'),
        ]);
        if (!active) return;
        setApiBaseUrl(settings.careerOpsApiBaseUrl ?? '');
        setTokenConfigured(Boolean(hasToken));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load the encrypted cloud connection settings.'
          );
        }
      }
    };
    void loadLocalConfig();
    return () => {
      active = false;
    };
  }, []);

  const apiRequest = useCallback(
    async <T,>(method: ApiMethod, path: string, body?: Record<string, unknown>): Promise<T> => {
      const api = window.electronAPI?.linkedinApiRequest;
      if (typeof api !== 'function') {
        throw new Error('This desktop build does not include the LinkedIn cloud API bridge.');
      }
      const response = (await api({ method, path, ...(body ? { body } : {}) })) as ApiEnvelope;
      if (response.status < 200 || response.status >= 300) {
        throw new Error(messageFromBody(response.body, 'CareerOps API request failed.'));
      }
      return response.body as T;
    },
    []
  );

  const refreshScheduledPosts = useCallback(async () => {
    const result = await apiRequest<{ scheduledPosts: ScheduledPostItem[] }>(
      'GET',
      '/v1/linkedin/scheduled-posts'
    );
    setScheduledPosts(Array.isArray(result.scheduledPosts) ? result.scheduledPosts : []);
  }, [apiRequest]);

  const refreshStatus = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [me, linkedIn, tenantControls] = await Promise.all([
        apiRequest<MemberInfo>('GET', '/v1/me'),
        apiRequest<LinkedInStatus>('GET', '/v1/linkedin/status'),
        apiRequest<TenantControls>('GET', '/v1/controls'),
      ]);
      setMember(me);
      setStatus(linkedIn);
      setControls(tenantControls);
      if (linkedIn.scheduledPublishingEnabled) {
        await refreshScheduledPosts();
      } else {
        setScheduledPosts([]);
      }
      setNotice('LinkedIn connection status refreshed.');
      setTokenConfigured(await window.electronAPI.hasApiKey('careerops-cloud'));
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to reach the authenticated CareerOps API.'
      );
      setStatus(null);
      setControls(null);
      setMember(null);
    } finally {
      setBusy(false);
    }
  }, [apiRequest, refreshScheduledPosts]);

  const capability = useCallback(
    (id: string) => status?.capabilities.find((item) => item.id === id),
    [status]
  );
  const isAvailable = useCallback(
    (id: string) => capability(id)?.status === 'available',
    [capability]
  );

  const saveConnection = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const normalizedUrl = apiBaseUrl.trim().replace(/\/$/, '');
      if (!isSecureApiOrigin(normalizedUrl)) {
        throw new Error(
          'Enter an HTTPS cloud API origin. HTTP is permitted only for localhost development.'
        );
      }
      const saved = await window.electronAPI.setSettings('careerOpsApiBaseUrl', normalizedUrl);
      if (!saved) throw new Error('CareerOps cloud API URL could not be saved.');
      if (cloudToken.trim()) {
        await window.electronAPI.setApiKey('careerops-cloud', cloudToken.trim());
        setCloudToken('');
        setTokenConfigured(true);
      }
      setApiBaseUrl(normalizedUrl);
      setNotice(
        'Cloud API settings saved. The bearer token is stored by the operating system keychain.'
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save cloud settings.');
    } finally {
      setBusy(false);
    }
  };

  const removeCloudToken = async () => {
    setBusy(true);
    setError('');
    try {
      await window.electronAPI.deleteApiKey('careerops-cloud');
      setCloudToken('');
      setTokenConfigured(false);
      setStatus(null);
      setControls(null);
      setMember(null);
      setNotice('Saved cloud API credential removed from secure storage.');
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Could not remove the cloud credential.'
      );
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const scopes = ['openid', 'profile', 'email', 'w_member_social'];
      if (status?.entitlements?.communityManagementApproved) {
        scopes.push('w_organization_social');
      }
      const result = await apiRequest<{ authorizationUrl: string }>(
        'POST',
        '/v1/linkedin/oauth/start',
        { scopes }
      );
      const authorizationUrl = new URL(result.authorizationUrl);
      if (
        authorizationUrl.origin !== 'https://www.linkedin.com' ||
        authorizationUrl.pathname !== '/oauth/v2/authorization'
      ) {
        throw new Error('The CareerOps API returned an unexpected LinkedIn authorization URL.');
      }
      await window.electronAPI.openExternal(authorizationUrl.toString());
      setNotice(
        'LinkedIn authorization opened in your browser. Complete consent there, then refresh connection status here.'
      );
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'Could not start LinkedIn authorization.'
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest<{ disconnected: boolean }>('DELETE', '/v1/linkedin/connection');
      await refreshStatus();
      setNotice('LinkedIn account disconnected.');
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : 'Could not disconnect LinkedIn.'
      );
    } finally {
      setBusy(false);
    }
  };

  const publishMemberPost = async () => {
    setBusy(true);
    setError('');
    try {
      if (!postText.trim() || postText.length > 3000) {
        throw new Error('A post must contain 1–3000 characters.');
      }
      const result = await apiRequest<{ postId: string; status: number }>(
        'POST',
        '/v1/linkedin/posts',
        { commentary: postText.trim() }
      );
      setNotice('Post published through LinkedIn. Post ID: ' + result.postId);
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : 'LinkedIn post publishing failed.'
      );
    } finally {
      setBusy(false);
    }
  };

  const scheduleMemberPost = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!postText.trim() || postText.length > 3000) {
        throw new Error('A scheduled post must contain 1–3000 characters.');
      }
      if (!scheduledAt) throw new Error('Choose a future publication time.');
      const scheduledAtDate = new Date(scheduledAt);
      if (!Number.isFinite(scheduledAtDate.getTime())) {
        throw new Error('The selected publication time is invalid.');
      }
      if (
        scheduledAtDate.getTime() < Date.now() + 2 * 60_000 ||
        scheduledAtDate.getTime() > Date.now() + 90 * 24 * 60 * 60_000
      ) {
        throw new Error('Choose a time at least 2 minutes from now and no more than 90 days ahead.');
      }

      // Keep the same idempotency key after ambiguous network failures, so a retry
      // retrieves the existing schedule rather than creating a duplicate row.
      const idempotencyKey = scheduleIdempotencyKey || crypto.randomUUID();
      if (!scheduleIdempotencyKey) setScheduleIdempotencyKey(idempotencyKey);
      const result = await apiRequest<{ scheduledPost: ScheduledPostItem }>(
        'POST',
        '/v1/linkedin/scheduled-posts',
        {
          commentary: postText.trim(),
          scheduledAt: scheduledAtDate.toISOString(),
          idempotencyKey,
        }
      );
      setScheduleIdempotencyKey('');
      setNotice('Post scheduled for ' + new Date(result.scheduledPost.scheduledAt).toLocaleString());
      await refreshScheduledPosts();
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : 'Unable to schedule this LinkedIn post.'
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelScheduledPost = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest<{ cancelled: boolean }>(
        'DELETE',
        '/v1/linkedin/scheduled-posts/' + encodeURIComponent(id)
      );
      await refreshScheduledPosts();
      setNotice('Scheduled LinkedIn post cancelled.');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : 'Unable to cancel the scheduled post.'
      );
    } finally {
      setBusy(false);
    }
  };

  const createMemberComment = async () => {
    setBusy(true);
    setError('');
    try {
      if (!commentTarget.trim() || !commentObject.trim() || !commentText.trim()) {
        throw new Error('Enter the target post URN, activity URN and comment text.');
      }
      const result = await apiRequest<{ commentId: string }>('POST', '/v1/linkedin/comments', {
        targetUrn: commentTarget.trim(),
        objectUrn: commentObject.trim(),
        commentary: commentText.trim(),
      });
      setNotice('Comment created through LinkedIn. Comment ID: ' + result.commentId);
      setCommentText('');
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : 'LinkedIn comment failed.');
    } finally {
      setBusy(false);
    }
  };

  const createMemberReaction = async () => {
    setBusy(true);
    setError('');
    try {
      if (!reactionRoot.trim()) throw new Error('Enter the root post or activity URN.');
      const result = await apiRequest<{ status: number }>('POST', '/v1/linkedin/reactions', {
        rootUrn: reactionRoot.trim(),
        reactionType,
      });
      setNotice('Reaction submitted through LinkedIn. HTTP ' + result.status + '.');
    } catch (reactionError) {
      setError(
        reactionError instanceof Error ? reactionError.message : 'LinkedIn reaction failed.'
      );
    } finally {
      setBusy(false);
    }
  };

  const removeMemberReaction = async () => {
    setBusy(true);
    setError('');
    try {
      if (!reactionEntity.trim()) throw new Error('Enter the post URN for the reaction to remove.');
      const result = await apiRequest<{ status: number }>(
        'DELETE',
        '/v1/linkedin/reactions?entityUrn=' + encodeURIComponent(reactionEntity.trim())
      );
      setNotice('Reaction removal submitted. HTTP ' + result.status + '.');
    } catch (reactionError) {
      setError(
        reactionError instanceof Error
          ? reactionError.message
          : 'Could not remove LinkedIn reaction.'
      );
    } finally {
      setBusy(false);
    }
  };

  const publishOrganizationPost = async () => {
    setBusy(true);
    setError('');
    try {
      if (!organizationUrn.trim() || !organizationPostText.trim()) {
        throw new Error('Enter an organization URN and post text.');
      }
      const result = await apiRequest<{ postId: string }>(
        'POST',
        '/v1/linkedin/organization/posts',
        {
          organizationUrn: organizationUrn.trim(),
          commentary: organizationPostText.trim(),
        }
      );
      setNotice('Organization post published. Post ID: ' + result.postId);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Organization post failed.');
    } finally {
      setBusy(false);
    }
  };

  const createOrganizationComment = async () => {
    setBusy(true);
    setError('');
    try {
      if (
        !organizationUrn.trim() ||
        !organizationCommentTarget.trim() ||
        !organizationCommentObject.trim() ||
        !organizationCommentText.trim()
      ) {
        throw new Error('Enter the organization URN, target post URN, activity URN and comment.');
      }
      const result = await apiRequest<{ commentId: string }>(
        'POST',
        '/v1/linkedin/organization/comments',
        {
          organizationUrn: organizationUrn.trim(),
          targetUrn: organizationCommentTarget.trim(),
          objectUrn: organizationCommentObject.trim(),
          commentary: organizationCommentText.trim(),
        }
      );
      setNotice('Organization comment created. Comment ID: ' + result.commentId);
      setOrganizationCommentText('');
    } catch (commentError) {
      setError(
        commentError instanceof Error ? commentError.message : 'Organization comment failed.'
      );
    } finally {
      setBusy(false);
    }
  };

  const createOrganizationReaction = async () => {
    setBusy(true);
    setError('');
    try {
      if (!organizationUrn.trim() || !reactionRoot.trim()) {
        throw new Error('Enter the organization URN and post / activity URN.');
      }
      const result = await apiRequest<{ status: number }>(
        'POST',
        '/v1/linkedin/organization/reactions',
        {
          organizationUrn: organizationUrn.trim(),
          rootUrn: reactionRoot.trim(),
          reactionType,
        }
      );
      setNotice('Organization reaction submitted. HTTP ' + result.status + '.');
    } catch (reactionError) {
      setError(
        reactionError instanceof Error ? reactionError.message : 'Organization reaction failed.'
      );
    } finally {
      setBusy(false);
    }
  };

  const removeOrganizationReaction = async () => {
    setBusy(true);
    setError('');
    try {
      if (!organizationUrn.trim() || !reactionEntity.trim()) {
        throw new Error('Enter the organization URN and post URN for the reaction to remove.');
      }
      const path =
        '/v1/linkedin/organization/reactions?organizationUrn=' +
        encodeURIComponent(organizationUrn.trim()) +
        '&entityUrn=' +
        encodeURIComponent(reactionEntity.trim());
      const result = await apiRequest<{ status: number }>('DELETE', path);
      setNotice('Organization reaction removal submitted. HTTP ' + result.status + '.');
    } catch (reactionError) {
      setError(
        reactionError instanceof Error
          ? reactionError.message
          : 'Could not remove organization reaction.'
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleLinkedInPause = async () => {
    if (member?.role !== 'owner') return;
    const paused = !(controls?.pausedChannels ?? []).includes('linkedin_assist');
    setBusy(true);
    setError('');
    try {
      await apiRequest('POST', '/v1/controls/channel-pause', {
        channel: 'linkedin_assist',
        paused,
      });
      await refreshStatus();
      setNotice(
        paused
          ? 'LinkedIn actions paused for this tenant.'
          : 'LinkedIn actions resumed for this tenant.'
      );
    } catch (pauseError) {
      setError(
        pauseError instanceof Error
          ? pauseError.message
          : 'Could not update the LinkedIn pause control.'
      );
    } finally {
      setBusy(false);
    }
  };

  const capabilities = useMemo(() => status?.capabilities ?? [], [status]);
  const channelPaused = Boolean(controls?.pausedChannels.includes('linkedin_assist'));
  const writesBlocked = Boolean(controls?.globalKillSwitch || channelPaused);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 15 }}>
              LinkedIn account connection
            </h3>
            <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: 11 }}>
              Uses the official LinkedIn OAuth and API path. The member access token stays in
              encrypted server storage.
            </p>
          </div>
          <span
            style={{
              color: status?.connected ? '#86efac' : '#fbbf24',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {status?.connected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <label style={{ color: '#cbd5e1', fontSize: 11 }}>CareerOps cloud API origin</label>
        <input
          value={apiBaseUrl}
          onChange={(event) => setApiBaseUrl(event.target.value)}
          placeholder="https://api.example.com"
          autoComplete="url"
          style={inputStyle}
        />
        <label style={{ color: '#cbd5e1', fontSize: 11 }}>
          Cloud OIDC bearer token
          <span style={{ display: 'block', color: '#94a3b8', fontWeight: 400, marginTop: 3 }}>
            Issued by your CareerOps identity provider. It is encrypted by the OS keychain and never
            sent back to the renderer.
          </span>
        </label>
        <input
          value={cloudToken}
          onChange={(event) => setCloudToken(event.target.value)}
          type="password"
          autoComplete="off"
          placeholder={
            tokenConfigured
              ? 'Saved securely. Enter a replacement only to rotate it.'
              : 'Paste the cloud API OIDC JWT'
          }
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void saveConnection()}
            disabled={busy}
          >
            Save cloud settings
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void removeCloudToken()}
            disabled={busy || !tokenConfigured}
          >
            Remove saved token
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void refreshStatus()}
            disabled={busy || !tokenConfigured}
          >
            Refresh status
          </button>
        </div>
        {tokenConfigured && (
          <p style={{ margin: 0, color: '#86efac', fontSize: 11 }}>
            Cloud bearer token is present in OS-backed secure storage.
          </p>
        )}
      </div>

      {status && (
        <>
          <div style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13 }}>Tenant controls</h4>
              <span
                style={{
                  color: writesBlocked ? '#fca5a5' : '#86efac',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {controls?.globalKillSwitch
                  ? 'Global kill switch ON'
                  : channelPaused
                    ? 'LinkedIn paused'
                    : 'Writes enabled'}
              </span>
            </div>
            {controls?.globalKillSwitch && (
              <p style={{ margin: 0, color: '#fca5a5', fontSize: 11 }}>
                The tenant-wide kill switch is active. LinkedIn write actions are blocked by the
                server.
              </p>
            )}
            {member?.role === 'owner' && (
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void toggleLinkedInPause()}
                disabled={busy || Boolean(controls?.globalKillSwitch)}
              >
                {channelPaused ? 'Resume LinkedIn channel' : 'Pause LinkedIn channel'}
              </button>
            )}
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 10 }}>
              All writes are audited by the cloud API and checked against the kill switch and
              channel pause immediately before execution.
            </p>
          </div>

          <div style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13 }}>
                Official LinkedIn capabilities
              </h4>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void connect()}
                disabled={busy || !tokenConfigured || Boolean(status.connected)}
              >
                Connect / authorize
              </button>
            </div>
            {status.expiresAt && (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 10 }}>
                Access token expires: {new Date(status.expiresAt).toLocaleString()}
              </p>
            )}
            <div style={{ display: 'grid', gap: 7 }}>
              {capabilities.map((item) => (
                <div
                  key={item.id}
                  style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 7 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ color: '#e2e8f0', fontSize: 11 }}>
                      {capabilityLabel(item.id)}
                    </strong>
                    <span
                      style={{
                        color: item.status === 'available' ? '#86efac' : '#fbbf24',
                        fontSize: 10,
                        textAlign: 'right',
                      }}
                    >
                      {capabilityState(item.status)}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: 10 }}>{item.reason}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void disconnect()}
              disabled={busy || !tokenConfigured}
            >
              Disconnect LinkedIn
            </button>
          </div>
        </>
      )}

      {status?.connected && (
        <>
          <div style={{ ...panelStyle, opacity: isAvailable('member_post_publish') ? 1 : 0.62 }}>
            <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13 }}>Publish a member post</h4>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 10 }}>
              This action publishes immediately when you press the button. Review the text first;
              there is no background publishing.
            </p>
            <textarea
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
              rows={5}
              maxLength={3000}
              placeholder="Write or load a LinkedIn post..."
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: postText.length > 3000 ? '#fca5a5' : '#94a3b8', fontSize: 10 }}>
                {postText.length}/3000 characters
              </span>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void publishMemberPost()}
                disabled={
                  busy ||
                  writesBlocked ||
                  !isAvailable('member_post_publish') ||
                  !postText.trim() ||
                  postText.length > 3000
                }
              >
                Publish now
              </button>
            </div>
          </div>

          {status.scheduledPublishingEnabled && (
            <div style={panelStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13 }}>Scheduled publishing</h4>
                <span style={{ color: '#86efac', fontSize: 10, fontWeight: 700 }}>Cloud worker enabled</span>
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>
                Schedules this exact reviewed text for the member account. The cloud worker checks tenant membership, LinkedIn authorization, channel pause and the global kill switch before publishing.
              </p>
              <label style={{ color: '#cbd5e1', fontSize: 11 }}>Publish at (your local time)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                min={new Date(Date.now() + 2 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
                max={new Date(Date.now() + 90 * 24 * 60 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
                onChange={(event) => setScheduledAt(event.target.value)}
                style={inputStyle}
                disabled={busy || writesBlocked}
              />
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void scheduleMemberPost()}
                disabled={
                  busy ||
                  writesBlocked ||
                  !isAvailable('member_post_publish') ||
                  !postText.trim() ||
                  postText.length > 3000 ||
                  !scheduledAt
                }
              >
                Schedule this post
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ color: '#e2e8f0', fontSize: 11 }}>Your scheduled posts</strong>
                <button type="button" style={buttonStyle} onClick={() => void refreshScheduledPosts()} disabled={busy}>
                  Refresh queue
                </button>
              </div>
              {scheduledPosts.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 10, margin: 0 }}>No scheduled posts found.</p>
              ) : scheduledPosts.map((item) => (
                <div key={item.id} style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 8, display: 'grid', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong style={{ color: '#e2e8f0', fontSize: 11 }}>{item.status.replace(/_/g, ' ')}</strong>
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{new Date(item.scheduledAt).toLocaleString()}</span>
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                    {item.commentary.length > 240 ? item.commentary.slice(0, 240) + '…' : item.commentary}
                  </p>
                  {item.errorCode && <span style={{ color: '#fbbf24', fontSize: 10 }}>Status detail: {item.errorCode}</span>}
                  {item.publishedPostUrn && <span style={{ color: '#86efac', fontSize: 10 }}>Published: {item.publishedPostUrn}</span>}
                  {item.status === 'scheduled' && (
                    <button type="button" style={buttonStyle} onClick={() => void cancelScheduledPost(item.id)} disabled={busy || writesBlocked}>
                      Cancel scheduled post
                    </button>
                  )}
                  {item.status === 'unknown_outcome' && (
                    <span style={{ color: '#fca5a5', fontSize: 10 }}>
                      LinkedIn may have accepted this post. It was not retried to avoid duplication; check LinkedIn before scheduling again.
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ ...panelStyle, opacity: isAvailable('member_comment_react') ? 1 : 0.62 }}>
            <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13 }}>
              Member comments and reactions
            </h4>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 10 }}>
              Requires Community Management API access and the granted member social feed write
              scope. Paste URNs from an authorized source; CareerOps does not scrape feeds.
            </p>
            <input
              value={commentTarget}
              onChange={(event) => setCommentTarget(event.target.value)}
              placeholder="Target post URN (share or ugcPost)"
              style={inputStyle}
            />
            <input
              value={commentObject}
              onChange={(event) => setCommentObject(event.target.value)}
              placeholder="Activity object URN"
              style={inputStyle}
            />
            <textarea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              rows={3}
              placeholder="Comment text..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void createMemberComment()}
              disabled={
                busy || writesBlocked || !isAvailable('member_comment_react') || !commentText.trim()
              }
            >
              Create comment
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 7 }}>
              <input
                value={reactionRoot}
                onChange={(event) => setReactionRoot(event.target.value)}
                placeholder="Reaction root post / activity URN"
                style={inputStyle}
              />
              <select
                value={reactionType}
                onChange={(event) => setReactionType(event.target.value as ReactionType)}
                style={inputStyle}
              >
                {REACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void createMemberReaction()}
              disabled={
                busy ||
                writesBlocked ||
                !isAvailable('member_comment_react') ||
                !reactionRoot.trim()
              }
            >
              Add reaction
            </button>
            <input
              value={reactionEntity}
              onChange={(event) => setReactionEntity(event.target.value)}
              placeholder="Post URN to remove your reaction from"
              style={inputStyle}
            />
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void removeMemberReaction()}
              disabled={
                busy ||
                writesBlocked ||
                !isAvailable('member_comment_react') ||
                !reactionEntity.trim()
              }
            >
              Remove reaction
            </button>
          </div>

          {isAvailable('organization_post_publish') && (
            <div style={panelStyle}>
              <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13 }}>
                Organization Page publishing
              </h4>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 10 }}>
                Requires approved Community Management API access, organization scopes and an
                eligible Page administrator role.
              </p>
              <input
                value={organizationUrn}
                onChange={(event) => setOrganizationUrn(event.target.value)}
                placeholder="Organization URN (urn:li:organization:...)"
                style={inputStyle}
              />
              <textarea
                value={organizationPostText}
                onChange={(event) => setOrganizationPostText(event.target.value)}
                rows={3}
                placeholder="Organization post text..."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void publishOrganizationPost()}
                disabled={
                  busy || writesBlocked || !organizationUrn.trim() || !organizationPostText.trim()
                }
              >
                Publish for organization
              </button>
              <input
                value={organizationCommentTarget}
                onChange={(event) => setOrganizationCommentTarget(event.target.value)}
                placeholder="Target post URN"
                style={inputStyle}
              />
              <input
                value={organizationCommentObject}
                onChange={(event) => setOrganizationCommentObject(event.target.value)}
                placeholder="Activity object URN"
                style={inputStyle}
              />
              <textarea
                value={organizationCommentText}
                onChange={(event) => setOrganizationCommentText(event.target.value)}
                rows={2}
                placeholder="Organization comment..."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <button
                type="button"
                style={buttonStyle}
                onClick={() => void createOrganizationComment()}
                disabled={
                  busy ||
                  writesBlocked ||
                  !organizationUrn.trim() ||
                  !organizationCommentTarget.trim() ||
                  !organizationCommentObject.trim() ||
                  !organizationCommentText.trim()
                }
              >
                Comment as organization
              </button>
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,.08)',
                  paddingTop: 10,
                  display: 'grid',
                  gap: 7,
                }}
              >
                <strong style={{ color: '#e2e8f0', fontSize: 11 }}>Organization reactions</strong>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => void createOrganizationReaction()}
                  disabled={
                    busy ||
                    writesBlocked ||
                    !isAvailable('organization_comment_react') ||
                    !organizationUrn.trim() ||
                    !reactionRoot.trim()
                  }
                >
                  Add selected reaction
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => void removeOrganizationReaction()}
                  disabled={
                    busy ||
                    writesBlocked ||
                    !isAvailable('organization_comment_react') ||
                    !organizationUrn.trim() ||
                    !reactionEntity.trim()
                  }
                >
                  Remove organization reaction
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: 11 }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ margin: 0, color: '#86efac', fontSize: 11 }}>
          {notice}
        </p>
      )}
      <p style={{ margin: 0, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>
        LinkedIn invitations, direct messages and inbox reading remain disabled until LinkedIn
        grants the exact partner API access. Browser scraping, cookies, hidden sessions and
        automated engagement are not used.
      </p>
    </section>
  );
}
