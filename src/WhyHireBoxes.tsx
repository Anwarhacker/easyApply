import type { Profile } from "./model";
import { ProfileAnswerCard } from "./ProfileAnswerCard";

export function WhyHireBoxes({ profile, onSaveWhyHire, defaultOpen = false }: {
  profile?: Profile;
  onSaveWhyHire?: (text: string) => Promise<void> | void;
  defaultOpen?: boolean;
}) {
  return <ProfileAnswerCard key={profile?.id || "no-profile"} profile={profile} field="whyHire" title="Why hire you" defaultOpen={defaultOpen} onSave={onSaveWhyHire}
    hint="Explain how your skills fit the role, then support your answer with a specific example. Tailor company details before copying."
    prompts={["Connect a requirement from the job description to a skill you have.", "Describe a real project, contribution, or result that demonstrates it.", "Explain how you would contribute. Use numbers only when you can verify them."]} />;
}
