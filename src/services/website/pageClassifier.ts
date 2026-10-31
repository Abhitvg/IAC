/**
 * Page Classifier
 * Categorizes crawled pages into domain sections (about, projects, experience, research, resume, contact).
 */

import { PageClassificationType } from './websiteIngestionTypes';

export function classifyPage(url: string, title: string, text: string): PageClassificationType {
  const u = url.toLowerCase();
  const t = (title + ' ' + text.slice(0, 500)).toLowerCase();

  if (u.endsWith('/') || u.match(/\/(index|home)?$/i)) {
    return 'home';
  }

  if (u.includes('/project') || u.includes('/work') || u.includes('/portfolio') || t.includes('featured projects') || t.includes('my projects')) {
    return 'projects';
  }

  if (u.includes('/experience') || u.includes('/career') || t.includes('work experience') || t.includes('employment history')) {
    return 'experience';
  }

  if (u.includes('/resume') || u.includes('/cv') || t.includes('curriculum vitae') || t.includes('download resume')) {
    return 'resume';
  }

  if (u.includes('/research') || t.includes('research interests') || t.includes('publications')) {
    return 'research';
  }

  if (u.includes('/publication') || t.includes('papers') || t.includes('conference proceedings')) {
    return 'publications';
  }

  if (u.includes('/about') || u.includes('/bio') || t.includes('about me') || t.includes('who i am')) {
    return 'about';
  }

  if (u.includes('/contact') || t.includes('get in touch') || t.includes('contact me')) {
    return 'contact';
  }

  return 'unknown';
}

