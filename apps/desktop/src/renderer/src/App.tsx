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
// Transcrição de demonstração com dados fictícios, isolada da persistência do aplicativo.
const TranscriptGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/TranscriptGallery")) : null;
// Composer, fila e estados de decisão sintéticos, sem chamadas de envio ao agente.
const ComposerGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/ComposerGallery")) : null;
// Os 11 estados do Boo em tamanhos, fundos e cores diferentes.
const BooGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/BooGallery")) : null;
const BooWorkGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/BooWorkGallery")) : null;
const BooStudioGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/BooStudioGallery")) : null;
const SidebarGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/SidebarGallery")) : null;
const BoardGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/BoardGallery")) : null;
const OfficeGallery = import.meta.env.DEV ? lazy(() => import("@/features/dev/OfficeGallery")) : null;
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
              {TranscriptGallery && <Route path="/transcript-gallery" element={<Suspense fallback={null}><TranscriptGallery /></Suspense>} />}
              {ComposerGallery && <Route path="/composer-gallery" element={<Suspense fallback={null}><ComposerGallery /></Suspense>} />}
              {BooGallery && <Route path="/boo-gallery" element={<Suspense fallback={null}><BooGallery /></Suspense>} />}
              {BooWorkGallery && <Route path="/boo-work-gallery" element={<Suspense fallback={null}><BooWorkGallery /></Suspense>} />}
              {OfficeGallery && <Route path="/office-gallery" element={<Suspense fallback={null}><OfficeGallery /></Suspense>} />}
              {BoardGallery && <Route path="/board-gallery" element={<Suspense fallback={null}><BoardGallery /></Suspense>} />}
              {SidebarGallery && <Route path="/sidebar-gallery" element={<Suspense fallback={null}><SidebarGallery /></Suspense>} />}
              {BooStudioGallery && <Route path="/boo-studio-gallery" element={<Suspense fallback={null}><BooStudioGallery /></Suspense>} />}
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
