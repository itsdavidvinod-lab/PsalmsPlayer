// The first sign-in step: right after a NEW account signs in with Google, it is asked for its languages and region once.
// "New" means profiles.onboarded_at is empty (migration 0019 marks every account that already exists as done). Finishing or skipping fills it.

/** Where to go right after sign-in: the first-step page (remembering the page asked for) when it has not been done, otherwise straight on.
 *  `undefined` means the profile could not be read: never hold a person back for that. */
export function afterSignInPath(onboardedAt: string | null | undefined, next: string): string {
  return onboardedAt === null ? `/onboarding?next=${encodeURIComponent(next)}` : next;
}

export type OnboardingChoice = { language_codes: string[]; region_code: string | null; onboarded_at: string };

/** What is saved when the person presses Continue (their choices) or Skip (nothing chosen). Either way the step counts as done. */
export function onboardingChoice(languages: string[], region: string, nowIso: string, skipped: boolean): OnboardingChoice {
  if (skipped) return { language_codes: [], region_code: null, onboarded_at: nowIso };
  return { language_codes: languages, region_code: region === '' ? null : region, onboarded_at: nowIso };
}
