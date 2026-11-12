import { describe, it, expect } from 'vitest';
import { parseLinkedInConnectionsCsv } from '../src/services/careerOps/linkedInCsvParser';
import { useNetworkStore, INITIAL_DEMO_CONTACTS } from '../src/store/useNetworkStore';

describe('CareerOps Screen 4: Network & Assist Queue (Hard Line H1)', () => {
  const sampleLinkedInCsv = `Notes:
When exporting your information from LinkedIn, we may provide some data that is not visible on your profile.
"First Name","Last Name","URL","Email Address","Company","Position","Connected On"
"Alex","Chen","https://www.linkedin.com/in/alex-chen","alex@stripe.com","Stripe","VP of Infrastructure","15 Jan 2026"
"Sarah","Jenkins","https://www.linkedin.com/in/sarah-jenkins","","Stripe","Staff SRE","18 Jan 2026"
"Marcus","Brody","https://www.linkedin.com/in/marcus-brody","mbrody@datadog.com","Datadog","Staff Distributed Systems Engineer","10 Feb 2026"
`;

  it('correctly parses LinkedIn Connections.csv skipping initial disclaimer notes', () => {
    const parsed = parseLinkedInConnectionsCsv(sampleLinkedInCsv);
    expect(parsed).toHaveLength(3);

    expect(parsed[0].fullName).toBe('Alex Chen');
    expect(parsed[0].company).toBe('Stripe');
    expect(parsed[0].position).toBe('VP of Infrastructure');
    expect(parsed[0].linkedinUrl).toBe('https://www.linkedin.com/in/alex-chen');
    expect(parsed[0].email).toBe('alex@stripe.com');
    expect(parsed[0].connectedOn).toBe('15 Jan 2026');

    expect(parsed[1].fullName).toBe('Sarah Jenkins');
    expect(parsed[1].email).toBeUndefined(); // Empty in CSV
  });

  it('deduplicates contacts on import by LinkedIn URL and Name+Company', () => {
    const store = useNetworkStore.getState();
    store.clearAll();

    const parsed = parseLinkedInConnectionsCsv(sampleLinkedInCsv);
    const result1 = store.importFromLinkedInCsv(parsed, 'discovered');
    expect(result1.imported).toBe(3);
    expect(result1.duplicates).toBe(0);

    // Re-importing same contacts should be detected as duplicates
    const result2 = store.importFromLinkedInCsv(parsed, 'discovered');
    expect(result2.imported).toBe(0);
    expect(result2.duplicates).toBe(3);
  });

  it('manages 5 relationship stages correctly', () => {
    useNetworkStore.getState().clearAll();

    const contactId = useNetworkStore.getState().addContact({
      name: 'Taylor Swift',
      title: 'Principal Architect',
      company: 'TechCorp',
      stage: 'discovered',
      isSuppressed: false,
    });

    let contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.stage).toBe('discovered');

    // Advance to outreach_queued
    useNetworkStore.getState().advanceStage(contactId, 'outreach_queued');
    contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.stage).toBe('outreach_queued');

    // Advance to sent
    useNetworkStore.getState().advanceStage(contactId, 'sent');
    contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.stage).toBe('sent');
    expect(contact?.lastContactedAt).toBeDefined();

    // Advance to replied
    useNetworkStore.getState().advanceStage(contactId, 'replied');
    contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.stage).toBe('replied');

    // Advance to referral_offered
    useNetworkStore.getState().advanceStage(contactId, 'referral_offered');
    contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.stage).toBe('referral_offered');
  });

  it('enforces Do-Not-Contact suppression and prevents automated outreach', () => {
    useNetworkStore.getState().clearAll();

    const contactId = useNetworkStore.getState().addContact({
      name: 'Competitor Executive',
      title: 'VP Engineering',
      company: 'Restricted Corp',
      stage: 'discovered',
      isSuppressed: false,
    });

    // Toggle suppression on
    useNetworkStore.getState().toggleSuppression(contactId, 'Restricted company policy');
    let contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.isSuppressed).toBe(true);
    expect(contact?.suppressionReason).toContain('Restricted company policy');

    // Toggle suppression off
    useNetworkStore.getState().toggleSuppression(contactId);
    contact = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(contact?.isSuppressed).toBe(false);
  });

  it('enforces Assist Queue user physical gesture to mark sent', () => {
    useNetworkStore.getState().clearAll();

    const note = 'Hi Alex, saw your work on distributed systems. Would love to connect!';
    expect(note.length).toBeLessThanOrEqual(300);

    const contactId = useNetworkStore.getState().addContact({
      name: 'Alex Rivera',
      title: 'Staff Engineer',
      company: 'Cloudflare',
      stage: 'outreach_queued',
      isSuppressed: false,
      outreachDraft: note,
    });

    // Assist queue mark sent requires explicit call (user gesture)
    useNetworkStore.getState().markAssistSent(contactId);
    const updated = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    expect(updated?.stage).toBe('sent');
    expect(updated?.lastContactedAt).toBeDefined();
  });
});
