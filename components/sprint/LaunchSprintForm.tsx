import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { TOPIC_TEMPLATES } from "@/lib/topic-templates";
import { launchSprint } from "@/app/(app)/sprint/actions";

export interface LaunchFormMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function LaunchSprintForm({
  members,
  invalid,
}: {
  members: LaunchFormMember[];
  invalid?: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Launch a discovery sprint
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          Name the sprint, pick the topics, and choose who takes part. Everyone
          you select gets their own short sessions, on their own schedule.
        </p>
      </div>

      {invalid && (
        <div className="mb-5 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-md text-danger">
          Check the fields — you need a name, a focus, at least one topic, and
          at least one participant.
        </div>
      )}

      <form action={launchSprint} className="space-y-6">
        <Card className="space-y-4 p-5">
          <div>
            <Label htmlFor="name">Sprint name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue="Operations Discovery"
              placeholder="Operations Discovery — Spring '26"
            />
          </div>
          <div>
            <Label htmlFor="primaryFocus">Primary focus</Label>
            <Input
              id="primaryFocus"
              name="primaryFocus"
              required
              placeholder="Quote-to-cash & exception handling"
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-md font-semibold">Topics</h2>
          <p className="mb-3 text-sm text-text-3">
            The conversations each participant will have. All four are
            recommended.
          </p>
          <div className="space-y-2">
            {TOPIC_TEMPLATES.map((t) => (
              <label
                key={t.key}
                className="flex cursor-pointer items-start gap-3 rounded border border-border bg-bg px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  name="topicKeys"
                  value={t.key}
                  defaultChecked
                  className="mt-1 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="block text-sm font-medium">{t.title}</span>
                  <span className="block text-xs text-text-3">
                    {t.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-md font-semibold">Participants</h2>
          <p className="mb-3 text-sm text-text-3">
            {members.length === 0
              ? "No one to invite yet — add your team first."
              : "Everyone here is included by default. Uncheck anyone who shouldn't take part."}
          </p>
          <div className="space-y-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded border border-border bg-bg px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  name="participantIds"
                  value={m.id}
                  defaultChecked
                  className="h-4 w-4 accent-brand"
                />
                <span className="flex-1">
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-text-3">{m.email}</span>
                </span>
                <span className="text-xs text-text-3">{m.role}</span>
              </label>
            ))}
          </div>
          {members.length === 0 && (
            <a
              href="/team"
              className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-hover"
            >
              Go to your team →
            </a>
          )}
        </Card>

        <Button
          type="submit"
          variant="brand"
          size="lg"
          disabled={members.length === 0}
        >
          Launch sprint
        </Button>
      </form>
    </main>
  );
}
