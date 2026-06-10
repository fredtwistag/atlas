import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <Logo />
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        We couldn&apos;t find that page.
      </h1>
      <p className="mt-3 max-w-md text-md text-text-2">
        The link may be old, or the sprint may have moved. Here&apos;s the way
        back.
      </p>
      <div className="mt-6 flex gap-2.5">
        <ButtonLink href="/" variant="primary">
          Home
        </ButtonLink>
        <ButtonLink href="/sign-in" variant="secondary">
          Open the demo sprint
        </ButtonLink>
      </div>
    </div>
  );
}
