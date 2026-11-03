import { BookOpen, Lock, Radio, Sparkles } from 'lucide-react';
import { AuthForm } from './AuthForm';

const POINTS = [
  { Icon: Radio, text: 'Live copilot: hears the interviewer and suggests answers in real time' },
  { Icon: BookOpen, text: 'Answers come from your own resume, notes and the job description' },
  { Icon: Sparkles, text: 'Practice with realistic questions and get scored feedback' },
  { Icon: Lock, text: 'Your resume, notes and transcripts stay on this PC' },
];

/** First screen for signed-out users. */
export function WelcomeScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="grid w-full max-w-4xl gap-10 md:grid-cols-2">
        <div className="flex flex-col justify-center gap-5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg" />
            <span className="text-xl font-semibold tracking-wide">Velora</span>
          </div>
          <h1 className="text-3xl font-semibold leading-tight">Walk into every interview prepared.</h1>
          <ul className="flex flex-col gap-3">
            {POINTS.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm">
                <Icon size={16} className="mt-0.5 shrink-0 text-accent" />
                <span className="muted">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Get started</h2>
            <p className="muted text-sm">Free plan includes monthly AI credits. No card needed.</p>
          </div>
          <AuthForm initialMode="signUp" />
          <button className="muted text-xs underline" onClick={onSkip}>
            Continue without an account (on-device features only)
          </button>
        </div>
      </div>
    </div>
  );
}
