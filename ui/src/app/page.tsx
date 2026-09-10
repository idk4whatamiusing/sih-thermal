import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Orbis</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Classifying NASA FIRMS thermal detections as industrial fires vs. natural sources — PS162, Smart India
        Hackathon 2026.
      </p>
      <Button asChild size="lg">
        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/google`}>Sign in with Google</a>
      </Button>
    </main>
  );
}
