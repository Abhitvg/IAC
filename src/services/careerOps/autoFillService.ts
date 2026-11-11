/**
 * CareerOps Automated Application Auto-Fill Service
 *
 * Provides battle-tested browser automation and auto-fill scripts for:
 * 1. Greenhouse (boards.greenhouse.io / job-boards.greenhouse.io)
 * 2. Lever (jobs.lever.co)
 * 3. Workday (*.myworkdayjobs.com)
 * 4. Ashby (jobs.ashbyhq.com)
 * 5. Generic ATS & Company Career Portals
 *
 * Implements React/Angular/Vue controlled input event simulation
 * via native value setter overrides so inputs register without getting wiped on blur.
 */

export interface CandidateAutoFillProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  state: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  currentCompany: string;
  currentTitle: string;
  yearsOfExperience: string;
  authorizedToWork: boolean;
  requiresSponsorship: boolean;
  authorizedToWorkVerified?: boolean;
  requiresSponsorshipVerified?: boolean;
}

export const DEFAULT_CANDIDATE_PROFILE: CandidateAutoFillProfile = {
  firstName: '',
  lastName: '',
  fullName: '',
  email: '',
  phone: '',
  location: '',
  city: '',
  state: '',
  country: '',
  linkedin: '',
  github: '',
  portfolio: '',
  currentCompany: '',
  currentTitle: '',
  yearsOfExperience: '',
  authorizedToWork: false,
  requiresSponsorship: false,
  authorizedToWorkVerified: false,
  requiresSponsorshipVerified: false,
};

/**
 * Builds the raw browser JavaScript snippet that can be executed in any browser DevTools Console
 * or executed via Bookmarklet / Content Script to auto-fill the active ATS application page.
 */
export function generateBrowserAutoFillScript(
  profile: CandidateAutoFillProfile,
  coverLetterText: string = '',
  resumeLatex: string = ''
): string {
  const payload = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: profile.fullName || `${profile.firstName} ${profile.lastName}`.trim(),
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    linkedin: profile.linkedin,
    github: profile.github,
    portfolio: profile.portfolio,
    currentCompany: profile.currentCompany,
    currentTitle: profile.currentTitle,
    yearsOfExperience: profile.yearsOfExperience,
    authorizedToWork: profile.authorizedToWork,
    requiresSponsorship: profile.requiresSponsorship,
    authorizedToWorkVerified: profile.authorizedToWorkVerified === true,
    requiresSponsorshipVerified: profile.requiresSponsorshipVerified === true,
    coverLetter: coverLetterText,
    resumeText: resumeLatex,
  };

  return `(function() {
  const data = ${JSON.stringify(payload, null, 2)};

  console.log("%c[CareerOps Auto-Fill] Starting ATS Form Autofill...", "color: #f97316; font-weight: bold; font-size: 13px;");

  function setNativeValue(element, value) {
    if (!element || value === undefined || value === null) return false;
    const proto = element instanceof HTMLTextAreaElement 
      ? window.HTMLTextAreaElement.prototype 
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
      desc.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    return true;
  }

  let filledCount = 0;

  function tryFill(selector, val, label) {
    if (!val) return;
    const el = document.querySelector(selector);
    if (el && !el.disabled && el.offsetParent !== null) {
      if (setNativeValue(el, val)) {
        filledCount++;
        console.log(\`  ✓ \${label}: "\${val.slice(0, 30)}..."\`);
      }
    }
  }

  function matchByLabelOrAttr(val, keywords, label) {
    if (!val) return;
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]), textarea'));
    for (const input of inputs) {
      if (input.value && input.value.trim().length > 0) continue;
      const id = (input.id || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const aria = (input.getAttribute('aria-label') || '').toLowerCase();
      const dataAuto = (input.getAttribute('data-automation-id') || '').toLowerCase();

      let labelText = '';
      if (input.id) {
        const lbl = document.querySelector(\`label[for="\${input.id}"]\`);
        if (lbl) labelText = lbl.innerText.toLowerCase();
      }
      if (!labelText) {
        const parentLabel = input.closest('label');
        if (parentLabel) labelText = parentLabel.innerText.toLowerCase();
      }

      const match = keywords.some(k => 
        id.includes(k) || name.includes(k) || placeholder.includes(k) || aria.includes(k) || dataAuto.includes(k) || labelText.includes(k)
      );

      if (match) {
        if (setNativeValue(input, val)) {
          filledCount++;
          console.log(\`  ✓ \${label} (matched on \${name || id || placeholder}): "\${val.slice(0, 30)}..."\`);
          return;
        }
      }
    }
  }

  // --- GREENHOUSE SELECTORS ---
  tryFill('#first_name', data.firstName, 'First Name (Greenhouse)');
  tryFill('#last_name', data.lastName, 'Last Name (Greenhouse)');
  tryFill('#email', data.email, 'Email (Greenhouse)');
  tryFill('#phone', data.phone, 'Phone (Greenhouse)');
  tryFill('#job_application_location', data.location, 'Location (Greenhouse)');
  tryFill('input[autocomplete="custom-question-linkedin"]', data.linkedin, 'LinkedIn (Greenhouse)');
  tryFill('input[autocomplete="custom-question-website"]', data.portfolio, 'Website (Greenhouse)');
  tryFill('textarea[name="job_application[cover_letter_text]"]', data.coverLetter, 'Cover Letter (Greenhouse)');
  tryFill('#cover_letter_text', data.coverLetter, 'Cover Letter (Greenhouse)');

  // --- LEVER SELECTORS ---
  tryFill('input[name="name"]', data.fullName, 'Full Name (Lever)');
  tryFill('input[name="email"]', data.email, 'Email (Lever)');
  tryFill('input[name="phone"]', data.phone, 'Phone (Lever)');
  tryFill('input[name="org"]', data.currentCompany, 'Current Org (Lever)');
  tryFill('input[name="urls[LinkedIn]"]', data.linkedin, 'LinkedIn (Lever)');
  tryFill('input[name="urls[GitHub]"]', data.github, 'GitHub (Lever)');
  tryFill('input[name="urls[Portfolio]"]', data.portfolio, 'Portfolio (Lever)');
  tryFill('input[name="urls[Twitter]"]', data.portfolio, 'Website (Lever)');
  tryFill('textarea[name="comments"]', data.coverLetter, 'Additional Info / Cover Letter (Lever)');

  // --- WORKDAY SELECTORS ---
  tryFill('[data-automation-id="legalNameSection_firstName"] input', data.firstName, 'First Name (Workday)');
  tryFill('[data-automation-id="legalNameSection_lastName"] input', data.lastName, 'Last Name (Workday)');
  tryFill('[data-automation-id="email"] input', data.email, 'Email (Workday)');
  tryFill('[data-automation-id="phone-number"] input', data.phone, 'Phone (Workday)');
  tryFill('[data-automation-id="addressSection_city"] input', data.city, 'City (Workday)');
  tryFill('[data-automation-id="coverLetter"] textarea', data.coverLetter, 'Cover Letter (Workday)');

  // --- ASHBY SELECTORS ---
  tryFill('input[name="_system_field_name"]', data.fullName, 'Full Name (Ashby)');
  tryFill('input[name="_system_field_email"]', data.email, 'Email (Ashby)');
  tryFill('input[name="_system_field_phone"]', data.phone, 'Phone (Ashby)');

  // --- HEURISTIC FALLBACKS FOR ANY FORM ---
  matchByLabelOrAttr(data.firstName, ['first_name', 'firstname', 'first name', 'given name'], 'First Name (Fuzzy)');
  matchByLabelOrAttr(data.lastName, ['last_name', 'lastname', 'last name', 'family name', 'surname'], 'Last Name (Fuzzy)');
  matchByLabelOrAttr(data.fullName, ['full_name', 'fullname', 'full name', 'candidate_name', 'applicant_name'], 'Full Name (Fuzzy)');
  matchByLabelOrAttr(data.email, ['email', 'e-mail'], 'Email (Fuzzy)');
  matchByLabelOrAttr(data.phone, ['phone', 'telephone', 'mobile', 'cell'], 'Phone (Fuzzy)');
  matchByLabelOrAttr(data.location, ['location', 'address', 'city'], 'Location (Fuzzy)');
  matchByLabelOrAttr(data.linkedin, ['linkedin', 'linked in'], 'LinkedIn (Fuzzy)');
  matchByLabelOrAttr(data.github, ['github', 'git hub'], 'GitHub (Fuzzy)');
  matchByLabelOrAttr(data.portfolio, ['portfolio', 'website', 'personal site', 'url'], 'Portfolio (Fuzzy)');
  matchByLabelOrAttr(data.coverLetter, ['cover_letter', 'cover letter', 'note to hiring', 'additional info', 'comments'], 'Cover Letter (Fuzzy)');

  // --- RADIO / CHECKBOX HEURISTICS FOR WORK AUTHORIZATION ---
  const radios = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
  radios.forEach(r => {
    const parent = r.closest('div, fieldset, tr, li') || r.parentElement;
    if (!parent) return;
    const txt = parent.innerText.toLowerCase();

    // Work authorization
    if (data.authorizedToWorkVerified && (txt.includes('authorized to work') || txt.includes('legally authorized'))) {
      if ((data.authorizedToWork && (txt.includes('yes') || r.value === 'yes' || r.value === '1')) ||
          (!data.authorizedToWork && (txt.includes('no') || r.value === 'no' || r.value === '0'))) {
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    }

    // Sponsorship
    if (data.requiresSponsorshipVerified && (txt.includes('require sponsorship') || txt.includes('sponsorship in the future'))) {
      if ((!data.requiresSponsorship && (txt.includes('no') || r.value === 'no' || r.value === '0')) ||
          (data.requiresSponsorship && (txt.includes('yes') || r.value === 'yes' || r.value === '1'))) {
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    }
  });

  const banner = document.createElement('div');
  banner.style.cssText = "position: fixed; top: 16px; right: 16px; z-index: 999999; background: #0f172a; color: #ffffff; padding: 12px 18px; border-radius: 10px; border: 2px solid #22c55e; box-shadow: 0 10px 25px rgba(0,0,0,0.5); font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;";
  banner.innerHTML = \`<span style="color:#22c55e;font-size:16px;">✓</span> CareerOps Auto-Filled \${filledCount} Fields! Review and upload resume.\`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 6000);

  return \`CareerOps auto-fill executed: \${filledCount} fields populated.\`;
})();`;
}

/**
 * Builds a compressed Bookmarklet URI that can be saved directly as a browser bookmark
 */
export function generateAutoFillBookmarklet(
  profile: CandidateAutoFillProfile,
  coverLetterText: string = ''
): string {
  const script = generateBrowserAutoFillScript(profile, coverLetterText);
  return `javascript:${encodeURIComponent(script.replace(/\n\s*/g, ' '))}`;
}

/**
 * Builds an automated Playwright script that navigates directly to the job URL,
 * fills out all application fields, and leaves the browser open for final human submission.
 */
export function generatePlaywrightAutoFillScript(
  jobUrl: string,
  profile: CandidateAutoFillProfile,
  coverLetterText: string = '',
  resumeFilePath: string = 'Abhishek_Singh_Resume.pdf'
): string {
  return `import { chromium } from 'playwright';

/**
 * CareerOps Automated Job Application Bot
 * Run with: npx ts-node apply.ts OR node apply.mjs
 */
async function autoApply() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to job portal: ${jobUrl}...');
  await page.goto('${jobUrl}', { waitUntil: 'networkidle' });

  // Inject CareerOps Auto-Fill logic into page
  await page.evaluate(${generateBrowserAutoFillScript(profile, coverLetterText)});

  // Attempt resume file upload if input[type="file"] exists
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    try {
      console.log('Attaching resume file: ${resumeFilePath}...');
      await fileInput.setInputFiles('${resumeFilePath}');
    } catch (e) {
      console.log('Note: Resume file input requires manual drop if path not found locally.');
    }
  }

  console.log('✅ Form auto-filled by CareerOps! Review entries in Chromium window before clicking Submit.');
}

autoApply().catch(console.error);
`;
}
