import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ZoomController } from "@/hooks/useZoom";
import NotFound from "./pages/NotFound.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import AppShell from "@/features/app/AppShell";
const FloatingMascotPage = lazy(() => import("@/features/panels/FloatingMascotPage"));
// Galeria dos componentes do DSH: só em desenvolvimento (#/dsh-gallery); some do build de produção.
const DshGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/DshGallery")) : null;
const RemoteFolderDialog = lazy(() => import("@/features/hosts/RemoteFolderDialog").then(module => ({ default: module.RemoteFolderDialog })));

const queryClient = new QueryClient();
const isDesktopRenderer = typeof window !== "undefined" && "vibeAPI" in window;
const AppRouter = isDesktopRenderer ? HashRouter : BrowserRouter;

const App = () => (
  <ThemeProvider defaultMode="dark" defaultTheme="boobot" storageKey="politron-ui-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {isDesktopRenderer && <Suspense fallback={null}><RemoteFolderDialog /></Suspense>}
        <ZoomController>
          <AppRouter>
            <Routes>
              <Route path="/" element={<AppShell />} />
              <Route path="/settings" element={<AppShell />} />
              <Route path="/mascot" element={<Suspense fallback={null}><FloatingMascotPage /></Suspense>} />
              {DshGallery && <Route path="/dsh-gallery" element={<Suspense fallback={null}><DshGallery /></Suspense>} />}
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppRouter>
        </ZoomController>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
