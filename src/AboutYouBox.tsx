import type { Profile } from "./model";
import { ProfileAnswerCard } from "./ProfileAnswerCard";

export function AboutYouBox({ profile, onSaveAboutYou, defaultOpen = false }: {
  profile?: Profile;
  onSaveAboutYou?: (text: string) => Promise<void> | void;
  defaultOpen?: boolean;
}) {
  return <ProfileAnswerCard key={profile?.id || "no-profile"} profile={profile} field="aboutYou" title="About you" defaultOpen={defaultOpen} onSave={onSaveAboutYou}
    hint="Introduce your background, relevant skills, and the work you want to do. Aim for a focused 3–5 sentences."
    prompts={["Start with your current role or education.", "Mention two or three relevant skills and one real project or achievement.", "Finish with the type of opportunity you are looking for. Avoid adding experience you do not have."]} />;
}
