import MemoContent from "@/components/MemoContent";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  className?: string;
}

const PersonaMarkdown = ({ content, className }: Props) => {
  return (
    <MemoContent
      content={content}
      className="min-w-0"
      contentClassName={cn(
        "text-sm leading-6 text-foreground/90",
        "[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm",
        "[&_h1]:border-0 [&_h2]:border-0 [&_h1]:pb-0 [&_h2]:pb-0",
        "[&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-2",
        "[&_p]:leading-6 [&_li]:leading-6",
        className,
      )}
    />
  );
};

export default PersonaMarkdown;
