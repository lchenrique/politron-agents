import { ArrowLeft, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeSelector } from '@/components/ide/ThemeSelector'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  return <section className="flex min-h-0 flex-1 flex-col overflow-auto">
    <header className="flex min-h-[58px] items-center gap-3 border-b border-border/50 px-5">
      <Button variant="ghost" size="icon" aria-label="Voltar ao espaço de trabalho" onClick={onClose}><ArrowLeft className="size-4" /></Button>
      <div><h1 className="text-sm font-semibold">Configurações</h1><p className="text-[11px] text-muted-foreground">Preferências do Politron</p></div>
    </header>
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 sm:p-10">
      <div><h2 className="text-xl font-semibold">Aparência</h2><p className="mt-1 text-sm text-muted-foreground">Personalize o tema e o contraste da interface.</p></div>
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="size-4" /></span><div><h3 className="text-sm font-medium">Tema e modo de cor</h3><p className="mt-1 text-xs text-muted-foreground">Escolha uma paleta e alterne entre claro e escuro.</p></div></div>
        <ThemeSelector />
      </section>
    </div>
  </section>
}
