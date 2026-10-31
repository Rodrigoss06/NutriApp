import {
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_SECTIONS,
  type ClinicalHistoryRevision,
} from '@nutricoach/contracts';
import { answerText } from './anamnesis-values';
import { HISTORY_BLOCKS } from './labels';

const ANSWER_LIST = 'grid gap-x-6 gap-y-3 text-sm lg:grid-cols-2';

/** Una revisión de solo lectura (RF-09, RF-43): lo guardado no se edita, se guarda otra revisión. */
export function HistoryRevisionView({ revision }: { revision: ClinicalHistoryRevision }) {
  if (revision.formCode === 'ANAMNESIS') {
    const blocks = HISTORY_BLOCKS.filter((block) => revision.answers[block.key]);
    return blocks.length === 0 ? (
      <p className="text-sm text-muted-foreground">Esta revisión no tiene texto.</p>
    ) : (
      <dl className={ANSWER_LIST}>
        {blocks.map((block) => (
          <div key={block.key}>
            <dt className="font-medium">{block.label}</dt>
            <dd className="whitespace-pre-wrap">{revision.answers[block.key]}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        <span className="font-medium">Modalidad:</span>{' '}
        {ANAMNESIS_MODALITY_LABELS[revision.answers.modality]}
      </p>
      {ANAMNESIS_SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="font-semibold">{section.title}</h3>
          <dl className={ANSWER_LIST}>
            {section.questions.map((question) => {
              const answer = revision.answers[question.code];
              return (
                <div key={question.code}>
                  <dt className="font-medium">{question.label}</dt>
                  <dd
                    className={
                      answer === undefined || answer === ''
                        ? 'text-muted-foreground'
                        : 'whitespace-pre-wrap'
                    }
                  >
                    {answerText(question, answer)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
