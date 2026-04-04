import { useState } from "react";
import { FolderOpen, Rocket, Settings, ChevronRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetAtom } from "jotai";
import { workspaceAtom } from "@/hooks/atoms";

interface SetupScreenProps {
  onComplete: (workspaceRoot?: string) => void;
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [step, setStep] = useState<"welcome" | "workspace" | "first-project">("welcome");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    try {
      const selectedPath = await window.vibeAPI.dialog.pickProjectFolder();
      if (selectedPath) {
        setWorkspaceRoot(selectedPath);
      }
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleSkipWorkspace = () => {
    setStep("first-project");
  };

  const handleComplete = () => {
    onComplete(workspaceRoot || undefined);
  };

  return (
    <div className="w-full h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {step === "welcome" && (
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-ide-indigo to-ide-purple flex items-center justify-center mb-8">
                <Rocket className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-ide-text mb-4">
                Bem-vindo ao Politron
              </h1>
              <p className="text-ide-text-dim mb-8 max-w-md">
                Vamos configurar seu workspace para você começar a trabalhar com seus agentes de IA.
              </p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  onClick={() => setStep("workspace")}
                  className="w-full h-12 bg-ide-indigo hover:bg-ide-indigo/90 text-white gap-2"
                >
                  <span>Começar configuração</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleComplete}
                  variant="outline"
                  className="w-full h-12 border-ide-border text-ide-text-dim hover:text-ide-text"
                >
                  Pular configuração
                </Button>
              </div>
            </div>
          )}

          {step === "workspace" && (
            <div className="flex flex-col">
              <button
                onClick={() => setStep("welcome")}
                className="text-ide-text-dim hover:text-ide-text text-sm mb-6 flex items-center gap-1 self-start"
              >
                ← Voltar
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-ide-indigo/10 border border-ide-indigo/20 flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-ide-indigo" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-ide-text">Workspace Root</h2>
                  <p className="text-sm text-ide-text-dim">Pasta principal dos seus projetos</p>
                </div>
              </div>

              <p className="text-ide-text-dim mb-6">
                Opcional. Se todos os seus projetos ficam em uma mesma pasta, selecione ela aqui. 
                O CEO global poderá navegar entre eles.
              </p>

              <div className="flex gap-2 mb-6">
                <input
                  value={workspaceRoot}
                  onChange={(e) => setWorkspaceRoot(e.target.value)}
                  placeholder="Nenhuma pasta selecionada"
                  className="flex-1 bg-ide-surface border border-ide-border rounded-lg px-3 py-2.5 text-sm text-ide-text placeholder:text-ide-text-dim/40"
                />
                <Button
                  onClick={handlePickFolder}
                  disabled={isPickingFolder}
                  variant="outline"
                  className="border-ide-border text-ide-text-dim hover:text-ide-text"
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleSkipWorkspace}
                  variant="outline"
                  className="flex-1 border-ide-border text-ide-text-dim hover:text-ide-text"
                >
                  Não definir root
                </Button>
                <Button
                  onClick={() => setStep("first-project")}
                  className="flex-1 bg-ide-indigo hover:bg-ide-indigo/90 text-white"
                >
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {step === "first-project" && (
            <div className="flex flex-col text-center">
              <button
                onClick={() => setStep("workspace")}
                className="text-ide-text-dim hover:text-ide-text text-sm mb-6 flex items-center gap-1 self-start"
              >
                ← Voltar
              </button>
              
              <div className="w-20 h-20 rounded-2xl bg-ide-green/10 border border-ide-green/20 flex items-center justify-center mb-6 mx-auto">
                <Globe className="w-10 h-10 text-ide-green" />
              </div>
              
              <h2 className="text-xl font-semibold text-ide-text mb-2">
                Tudo pronto!
              </h2>
              <p className="text-ide-text-dim mb-8">
                Você pode criar seu primeiro projeto agora ou fazer isso depois pelo sidebar.
              </p>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleComplete}
                  className="w-full h-12 bg-ide-indigo hover:bg-ide-indigo/90 text-white"
                >
                  Ir para o Workspace
                </Button>
                <p className="text-xs text-ide-text-dim">
                  Você pode criar projetos clicando no <strong>+</strong> no sidebar esquerdo
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-ide-border/50 text-center">
        <p className="text-xs text-ide-text-dim">
          Politron OpenCode — IA Experimental
        </p>
      </div>
    </div>
  );
}
