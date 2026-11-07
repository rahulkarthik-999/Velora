import { describe, expect, it } from 'vitest';
import {
  ResumeAnalyzeInput,
  ResumeAnalyzeOutput,
  resumeAnalyzePrompt,
  JobMatchInput,
  JobMatchOutput,
  jobMatchPrompt,
  MockTurnInput,
  MockTurnOutput,
  mockTurnPrompt,
  ReportEvaluateInput,
  ReportEvaluateModelOutput,
  reportEvaluatePrompt,
  computeObjectiveSpeechMetrics,
  CodingAssistantInput,
  codingAssistantPrompt,
  SqlAssistantInput,
  sqlAssistantPrompt,
  SystemDesignInput,
  systemDesignPrompt,
  RoadmapGenerateInput,
  roadmapGeneratePrompt,
} from '../src/lib/career';

describe('Velora AI Career Companion — Phases 2 to 7', () => {
  it('Phase 2: validates ResumeAnalyzeInput, enforces non-fabrication in prompt, and parses ResumeAnalyzeOutput', () => {
    const input = ResumeAnalyzeInput.parse({
      resumeText: 'Senior Backend Engineer with 6 years of experience building distributed services in TypeScript, Node.js, PostgreSQL, and Kafka.',
      targetRole: 'Staff Backend Engineer',
    });
    const spec = resumeAnalyzePrompt(input);
    expect(spec.system).toMatch(/NEVER fabricate qualifications/i);
    expect(spec.user).toContain('Staff Backend Engineer');

    const sampleOut = ResumeAnalyzeOutput.parse({
      candidateProfile: {
        headline: 'Senior Backend Engineer',
        summary: '6 years building distributed services.',
        technicalSkills: ['TypeScript', 'PostgreSQL', 'Kafka'],
      },
      qualityAnalysis: {
        overallScore: 86,
        atsCompatibilityScore: 90,
        impactScore: 82,
        clarityScore: 88,
        completenessScore: 85,
        executiveSummary: 'Strong backend foundation.',
      },
      improvedSummary: 'Senior Backend Engineer specializing in high-throughput Node.js and Kafka systems.',
      bulletImprovements: [
        {
          section: 'Experience',
          original: 'Built Kafka consumers.',
          improved: 'Engineered resilient Kafka consumers with dead-letter queues, improving throughput by [X%].',
          reason: 'Highlights resilience pattern and invites candidate metric.',
        },
      ],
    });
    expect(sampleOut.disclaimer).toMatch(/approve any edits/i);
  });

  it('Phase 3: validates JobMatchInput and enforces non-probability guardrail in JobMatchOutput', () => {
    const input = JobMatchInput.parse({
      jobTitle: 'Senior Full-Stack Engineer',
      company: 'Acme Cloud',
      jobDescription: 'Looking for a Senior Full-Stack Engineer experienced in React, TypeScript, Node.js, PostgreSQL, and AWS.',
      resumeText: 'Experienced in React, TypeScript, and Node.js.',
    });
    const spec = jobMatchPrompt(input);
    expect(spec.system).toMatch(/Never present alignmentScore as an objective hiring probability/i);

    const parsedOut = JobMatchOutput.parse({
      jobProfile: {
        jobTitle: 'Senior Full-Stack Engineer',
        seniority: 'Senior',
        requiredSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      },
      matchAssessment: {
        alignmentScore: 78,
        alignmentLabel: 'Strong Alignment',
        compatibilitySummary: 'Strong match on core TypeScript stack; add AWS & PostgreSQL depth.',
        matchedSkills: ['React', 'TypeScript', 'Node.js'],
        missingSkills: ['AWS', 'PostgreSQL'],
      },
      interviewDifficulty: {
        level: 'Advanced',
        rationale: 'Requires end-to-end distributed architecture and frontend performance.',
      },
    });
    expect(parsedOut.matchAssessment.disclaimer).toMatch(/NOT an objective hiring probability/i);
  });

  it('Phase 4: builds conversational mock interview prompt and detects wrap-up threshold', () => {
    const input = MockTurnInput.parse({
      role: 'Backend Engineer',
      experienceLevel: 'senior',
      interviewType: 'system_design',
      targetQuestionCount: 3,
      history: [
        { speaker: 'interviewer', text: 'Q1' },
        { speaker: 'candidate', text: 'A1' },
        { speaker: 'interviewer', text: 'Q2' },
        { speaker: 'candidate', text: 'A2' },
      ],
      candidateMessage: 'A3',
    });
    const spec = mockTurnPrompt(input);
    expect(spec.system).toMatch(/completed the target number of questions/i);

    const turnOut = MockTurnOutput.parse({
      interviewerResponse: 'Thank you for walking through that architecture.',
      currentQuestion: 'Wrap up',
      questionNumber: 3,
      questionCategory: 'System Design',
      isInterviewComplete: true,
    });
    expect(turnOut.isInterviewComplete).toBe(true);
  });

  it('Phase 5: computes deterministic objective speech metrics and validates 7-dimension report rubric', () => {
    const metrics = computeObjectiveSpeechMetrics([
      { speaker: 'interviewer', text: 'Tell me about a time you resolved a production outage.' },
      {
        speaker: 'candidate',
        text: 'Um basically we had a database connection pool leak in production, and I like isolated the slow query and deployed a fix within twenty minutes.',
        durationMs: 12000,
        responseLatencyMs: 1800,
      },
    ]);
    expect(metrics.totalWords).toBeGreaterThan(20);
    expect(metrics.fillerWordCount).toBeGreaterThanOrEqual(3); // um, basically, like
    expect(metrics.estimatedWordsPerMinute).toBeGreaterThan(50);
    expect(metrics.averageResponseLatencyMs).toBe(1800);
    expect(metrics.measurementNote).toMatch(/never claim to measure personality/i);

    const evalInput = ReportEvaluateInput.parse({
      role: 'SRE',
      interviewType: 'behavioral',
      turns: [
        { speaker: 'interviewer', text: 'Tell me about an incident.' },
        { speaker: 'candidate', text: 'We mitigated a Redis failover issue in 15 minutes.' },
      ],
    });
    const spec = reportEvaluatePrompt(evalInput);
    expect(spec.system).toMatch(/STAR Methodology/i);

    const parsedReport = ReportEvaluateModelOutput.parse({
      overallScore: 8.2,
      overallAssessment: 'Clear incident breakdown.',
      categoryScores: [
        { category: 'Technical Accuracy', score: 9, rationale: 'Accurate Redis failover steps.', evidenceQuote: 'mitigated a Redis failover issue' },
      ],
    });
    expect(parsedReport.overallScore).toBe(8.2);
  });

  it('Phase 6: builds prompts for Coding, SQL, and System Design assistants', () => {
    const codingSpec = codingAssistantPrompt(
      CodingAssistantInput.parse({
        problemStatement: 'Implement an LRU Cache with O(1) get and put.',
        language: 'TypeScript',
      })
    );
    expect(codingSpec.system).toMatch(/TypeScript/);

    const sqlSpec = sqlAssistantPrompt(
      SqlAssistantInput.parse({
        question: 'Find top 3 salaries per department using window functions.',
        dialect: 'PostgreSQL',
      })
    );
    expect(sqlSpec.system).toMatch(/PostgreSQL/);

    const sdSpec = systemDesignPrompt(
      SystemDesignInput.parse({
        prompt: 'Design a global notification service.',
        scaleLevel: 'Planet-Scale (100M+ DAU)',
      })
    );
    expect(sdSpec.user).toMatch(/Planet-Scale/);
  });

  it('Phase 7: builds personalized Career Learning Roadmap prompt', () => {
    const roadmapSpec = roadmapGeneratePrompt(
      RoadmapGenerateInput.parse({
        targetRole: 'Senior Frontend Engineer',
        currentSkills: ['React', 'TypeScript'],
        missingSkills: ['Web Workers', 'System Design'],
        weeksAvailable: 6,
      })
    );
    expect(roadmapSpec.user).toContain('Senior Frontend Engineer');
    expect(roadmapSpec.user).toContain('Web Workers');
  });
});
