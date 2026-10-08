import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export default function AdminNavigationActions({
  uploadHref,
  matchesHref,
}: {
  uploadHref: string;
  matchesHref: string;
}) {
  return (
    <ButtonGroup className="mt-6 flex flex-wrap gap-[.7rem]">
      <Button asChild variant="gold" size="lg">
        <a href={uploadHref}>Upload a report</a>
      </Button>
      <Button asChild variant="outline" size="lg">
        <a href={matchesHref}>Review path matches</a>
      </Button>
    </ButtonGroup>
  );
}
