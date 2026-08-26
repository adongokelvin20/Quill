"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogIn, LogOut, User as UserIcon, Loader2, Mail, Lock, UserCircle } from "lucide-react";

export function AuthButton() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  if (status === "loading") {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (session) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg bg-muted px-3 py-1.5 sm:flex">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-quill text-xs font-bold text-quill-foreground">
            {(session.user?.name ?? session.user?.email ?? "U")[0].toUpperCase()}
          </div>
          <span className="text-xs font-medium text-foreground">
            {session.user?.name ?? session.user?.email?.split("@")[0]}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-muted-foreground hover:text-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline ml-1.5">Sign out</span>
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-quill text-quill-foreground hover:bg-quill/90">
          <LogIn className="h-4 w-4" />
          <span className="ml-1.5">Sign in</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-quill">Welcome to Quill</DialogTitle>
          <DialogDescription>
            Sign in to save your books and access them from anywhere. New here? Create an account in seconds.
          </DialogDescription>
        </DialogHeader>
        <AuthTabs onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AuthTabs({ onSuccess }: { onSuccess: () => void }) {
  return (
    <Tabs defaultValue="signin" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Sign in</TabsTrigger>
        <TabsTrigger value="signup">Create account</TabsTrigger>
      </TabsList>
      <TabsContent value="signin">
        <SignInForm onSuccess={onSuccess} />
      </TabsContent>
      <TabsContent value="signup">
        <SignUpForm onSuccess={onSuccess} />
      </TabsContent>
    </Tabs>
  );
}

function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Sign in failed", { description: res.error });
      } else {
        toast.success("Welcome back!", { description: email });
        onSuccess();
      }
    } catch (err) {
      toast.error("Sign in failed", { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="signin-email" className="flex items-center gap-1.5 text-xs">
          <Mail className="h-3 w-3" /> Email
        </Label>
        <Input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu.gh"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password" className="flex items-center gap-1.5 text-xs">
          <Lock className="h-3 w-3" /> Password
        </Label>
        <Input
          id="signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full bg-quill text-quill-foreground hover:bg-quill/90">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        <span className="ml-1.5">Sign in</span>
      </Button>
    </form>
  );
}

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error("Sign up failed", { description: data.error ?? "Unknown error" });
        return;
      }
      // Auto sign-in after signup
      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        toast.error("Account created but sign-in failed", { description: signInRes.error });
      } else {
        toast.success("Account created!", { description: `Welcome to Quill, ${name || email}!` });
        onSuccess();
      }
    } catch (err) {
      toast.error("Sign up failed", { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="signup-name" className="flex items-center gap-1.5 text-xs">
          <UserCircle className="h-3 w-3" /> Name (optional)
        </Label>
        <Input
          id="signup-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ama Mensah"
          autoComplete="name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-email" className="flex items-center gap-1.5 text-xs">
          <Mail className="h-3 w-3" /> Email
        </Label>
        <Input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu.gh"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-password" className="flex items-center gap-1.5 text-xs">
          <Lock className="h-3 w-3" /> Password (min 6 characters)
        </Label>
        <Input
          id="signup-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full bg-quill text-quill-foreground hover:bg-quill/90">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserIcon className="h-4 w-4" />}
        <span className="ml-1.5">Create account</span>
      </Button>
    </form>
  );
}
