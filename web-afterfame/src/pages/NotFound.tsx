import { Link } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const NotFound = () => (
  <div className="grid min-h-dvh place-items-center px-6 text-center">
    <div>
      <Logo className="mb-8 inline-block" />
      <h1 className="font-display text-6xl font-black">404</h1>
      <p className="mt-2 text-muted-foreground">This page never went viral. It never existed.</p>
      <Button asChild className="mt-6 font-bold">
        <Link to="/">Go home</Link>
      </Button>
    </div>
  </div>
);

export default NotFound;
