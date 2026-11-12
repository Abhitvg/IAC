import type { Person, PersonRankingScore } from './person-types';

export interface TargetRoleContext {
  targetCompany: string;
  targetRoleTitle?: string;
}

export class PersonRanker {
  /**
   * Computes an explainable ranking score for a contact relative to a target company and role.
   */
  public rankPerson(person: Person, context: TargetRoleContext): PersonRankingScore {
    // 1. Warmth (0 - 100)
    let warmth = 20;
    let warmthNote = 'Cold contact';
    switch (person.relationship) {
      case '1st_degree':
        warmth = 95;
        warmthNote = 'Direct 1st-degree connection';
        break;
      case 'ex_colleague':
        warmth = 85;
        warmthNote = 'Former colleague';
        break;
      case 'alumni':
        warmth = 70;
        warmthNote = 'Shared school or company alumni';
        break;
      case 'open_source':
        warmth = 65;
        warmthNote = 'Collaborated in open-source projects';
        break;
      case 'conference_speaker':
        warmth = 50;
        warmthNote = 'Industry conference speaker or author';
        break;
      default:
        warmth = 20;
    }

    // 2. Relevance (0 - 100)
    let relevance = 30;
    const isTargetCompany =
      person.company.toLowerCase() === context.targetCompany.toLowerCase();

    if (isTargetCompany) {
      switch (person.roleDomain) {
        case 'hiring_manager':
          relevance = 95;
          break;
        case 'recruiter':
          relevance = 85;
          break;
        case 'peer_engineer':
          relevance = 75;
          break;
        case 'executive':
          relevance = 65;
          break;
        default:
          relevance = 50;
      }
    } else {
      relevance = person.relationship === 'alumni' || person.relationship === '1st_degree' ? 50 : 25;
    }

    // 3. Reachability (0 - 100)
    let reachability = 90;
    if (person.crmStage === 'opted_out') {
      reachability = 0;
    } else if (person.verificationSource === 'licensed_provider') {
      reachability = 100;
    } else if (person.verificationSource === 'public_company_page') {
      reachability = 90;
    } else {
      reachability = 85;
    }

    // 4. Recency / Cooldown (0 - 100)
    let recencyActivity = 90;
    if (person.lastContactedAt) {
      const msSince = Date.now() - new Date(person.lastContactedAt).getTime();
      const daysSince = msSince / (1000 * 3600 * 24);
      if (daysSince < 30) {
        recencyActivity = Math.max(10, Math.round(daysSince * 2.5)); // Cooldown penalty
      } else {
        recencyActivity = 85;
      }
    }

    // 5. Reciprocity Potential (0 - 100)
    let reciprocityPotential = 40;
    if (person.howICanHelp && person.howICanHelp.trim().length > 10) {
      reciprocityPotential = 85;
    } else if (person.relationship === 'alumni' || person.relationship === 'open_source') {
      reciprocityPotential = 70;
    }

    // Weighted composite
    const compositeScore = Math.round(
      0.35 * warmth +
      0.30 * relevance +
      0.15 * reachability +
      0.10 * recencyActivity +
      0.10 * reciprocityPotential
    );

    const explainableReason = `${warmthNote} at ${person.company} (${person.roleDomain.replace('_', ' ')}); warmth=${warmth}, relevance=${relevance}, composite=${compositeScore}.`;

    return {
      personId: person.id,
      warmth,
      relevance,
      reachability,
      recencyActivity,
      reciprocityPotential,
      compositeScore,
      explainableReason,
    };
  }

  public rankAndSort(people: Person[], context: TargetRoleContext): Array<{ person: Person; score: PersonRankingScore }> {
    return people
      .map((p) => ({ person: p, score: this.rankPerson(p, context) }))
      .sort((a, b) => b.score.compositeScore - a.score.compositeScore);
  }
}
