import {
  changePasswordSchema,
  createUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@oficina/shared';

describe('password flow schemas', () => {
  it('normaliza solicitação de esqueci minha senha', () => {
    expect(
      forgotPasswordSchema.parse({
        tenantSlug: ' Oficina-Modelo ',
        email: ' USER@EMAIL.COM ',
      }),
    ).toEqual({ tenantSlug: 'oficina-modelo', email: 'user@email.com' });
  });

  it('exige senha forte mínima no reset público', () => {
    expect(() =>
      resetPasswordSchema.parse({ token: 'a'.repeat(64), password: '123' }),
    ).toThrow();
    expect(
      resetPasswordSchema.parse({
        token: 'a'.repeat(64),
        password: 'Senha@123',
      }),
    ).toEqual({ token: 'a'.repeat(64), password: 'Senha@123' });
  });

  it('valida confirmação de senha na troca logada', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'Atual@123',
        password: 'Nova@123',
        confirmPassword: 'Outra@123',
      }),
    ).toThrow();
  });

  it('cria usuários exigindo troca de senha por padrão', () => {
    expect(
      createUserSchema.parse({
        name: 'Atendente Teste',
        email: 'atendente@oficina.com',
        password: 'Senha@123',
        role: 'ATENDENTE',
      }).forcePasswordChange,
    ).toBe(true);
  });
});
