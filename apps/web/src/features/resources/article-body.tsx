import { articleBlocks, inlineParts } from './resource-view';

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, i) =>
        part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}

/** El texto de un artículo (RF-30): títulos, párrafos y listas; nunca HTML del autor (ADR-094). */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-3 text-base leading-relaxed">
      {articleBlocks(markdown).map((block, i) => {
        if (block.type === 'heading') {
          const Heading = block.level === 2 ? 'h2' : 'h3';
          return (
            <Heading
              key={i}
              className={block.level === 2 ? 'text-xl font-semibold' : 'text-lg font-semibold'}
            >
              <Inline text={block.text} />
            </Heading>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-6">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
