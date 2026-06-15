import {
  Body,
  Controller,
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

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.auth.login(
      body.tenantSlug,
      body.email,
      body.password,
      this.meta(req),
    );
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
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
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ) {
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
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.cookies?.[this.cookieName()]);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
