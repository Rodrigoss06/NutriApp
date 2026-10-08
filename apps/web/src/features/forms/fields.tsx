'use client';

import { Button, describedBy, FieldMessages, Input, Label } from '@nutricoach/ui';
import { Eye, EyeOff } from 'lucide-react';
import {
  useId,
  useState,
  type BaseSyntheticEvent,
  type ComponentProps,
  type SyntheticEvent,
  type ReactNode,
} from 'react';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
}

/** Campo con etiqueta, ayuda y error enlazados (accesible). Pegar siempre permitido. */
export function TextField({ label, hint, error, ...props }: TextFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'autoComplete'> {
  readonly autoComplete: 'current-password' | 'new-password';
}

/** Contraseña con botón para mostrarla. autocomplete correcto para el gestor de contraseñas. */
export function PasswordField({ label, hint, error, autoComplete, ...props }: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...props}
        />
        <Button
          variant="secondary"
          size="icon"
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-controls={id}
          onClick={() => {
            setVisible((v) => !v);
          }}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export const NEW_PASSWORD_HINT =
  'De 10 a 128 caracteres. Evita contraseñas comunes y que contengan tu correo.';

/** handleSubmit de react-hook-form devuelve una promesa; el atributo onSubmit espera void. */
export function submitWith(
  handler: (event?: BaseSyntheticEvent) => Promise<void>,
): (event: SyntheticEvent<HTMLFormElement>) => void {
  return (event) => {
    void handler(event);
  };
}
