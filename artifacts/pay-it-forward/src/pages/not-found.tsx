import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-black text-foreground mb-2">404</h1>
        <p className="text-lg font-semibold text-foreground mb-2">Page Not Found</p>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          This page doesn't exist or may have moved. Let's get you back on track.
        </p>
        <div className="flex flex-col gap-3 w-full">
          <Button className="w-full h-12 font-black gap-2" onClick={() => setLocation("/")}>
            <Home className="w-4 h-4" />
            Back to Map
          </Button>
          <Button variant="outline" className="w-full h-12 font-semibold gap-2" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
