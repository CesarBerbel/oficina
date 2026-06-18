import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type LoginResponse,
  type ResetPasswordInput,
} from '@oficina/shared';
import { AuthService, type IssuedSession } from './auth.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieName(): string {
    return this.config.get<string>('AUTH_COOKIE_NAME') ?? 'oficina_rt';
  }

  private setRefreshCookie(res: Response, session: IssuedSession): void {
    res.cookie(this.cookieName(), session.refreshToken, {
      httpOnly: true,
      secure: this.config.get('AUTH_COOKIE_SECURE') === true,
      sameSite: 'lax',
      path: '/',
      expires: session.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.cookieName(), { path: '/' });
  }

  private meta(req: Request) {
    return {
      ip: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }

  /** Host real da requisição (atrás do proxy: X-Forwarded-Host). */
  private requestHost(req: Request): string | null {
    const xfh = req.headers['x-forwarded-host'];
    const raw = (Array.isArray(xfh) ? xfh[0] : xfh) ?? req.headers.host ?? null;
    return raw ? raw.toString().split(',')[0].trim().toLowerCase() : null;
  }

  /**
   * Defesa CSRF para fluxos baseados em cookie (refresh): se a requisição trouxer
   * Origin/Referer, ele precisa ser confiável. Aceita a WEB_ORIGIN configurada
   * (cobre o dev, em que SPA e API têm origens diferentes) OU a mesma origem do
   * host da requisição (cobre qualquer subdomínio/domínio próprio do SaaS, sem
   * precisar listar cada um). Requisições sem origem (server-to-server, testes)
   * passam — o ataque CSRF sempre envia uma origem.
   */
  private assertTrustedOrigin(req: Request): void {
    let origin = req.headers.origin ?? null;
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch {
        origin = null;
      }
    }
    if (!origin) return;

    const allowed = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    if (origin === allowed) return;

    const reqHost = this.requestHost(req);
    try {
      if (reqHost && new URL(origin).host.toLowerCase() === reqHost) return;
    } catch {
      /* origem malformada → barra abaixo */
    }
    throw new ForbiddenException('Origem não autorizada');
  }

  @Public()
  // Limite de tentativas de login por minuto. Relaxável por env em CI/e2e
  // (mesmo padrão de RATE_LIMIT_MAX); padrão de produção = 5.
  @Throttle({
    default: { limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT ?? 5), ttl: 60_000 },
  })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    // No subdomínio próprio a conta vem do host; no apex/dev, do slug informado.
    const account = await this.auth.resolveAccountByHost(this.requestHost(req));
    const session = await this.auth.login(
      { tenantSlug: body.tenantSlug ?? null, accountId: account?.id ?? null },
      body.email,
      body.password,
      this.meta(req),
    );
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken, user: session.user };
  }

  /** Qual conta este host (subdomínio/domínio próprio) representa — null no apex. */
  @Public()
  @Get('context')
  context(@Req() req: Request) {
    return this.auth.loginContext(this.requestHost(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    this.assertTrustedOrigin(req);
    const raw = req.cookies?.[this.cookieName()];
    if (!raw) throw new UnauthorizedException('Sessão expirada');
    const session = await this.auth.refresh(raw, this.meta(req));
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    return this.auth.requestPasswordReset(body.tenantSlug, body.email, this.meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post(['change-password', 'me/change-password'])
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.auth.changePassword(user.id, body.password, body.currentPassword);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[this.cookieName()]);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
