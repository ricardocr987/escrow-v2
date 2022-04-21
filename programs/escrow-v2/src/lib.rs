use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};
declare_id!("fqj2TjuPyPpW8a3biqpgfCJn2bWqmGGrDws4uvv8LFZ");

#[program]
pub mod escrow_v2 {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        escrow.authority = ctx.accounts.authority.key();
        escrow.mint_token_maker = ctx.accounts.mint_token_maker.key();
        escrow.mint_token_taker = ctx.accounts.mint_token_taker.key();
        escrow.amount_a = amount_a;
        escrow.amount_b = amount_b;
        // Bump seeds found during constraint validation. We dont need to pass it via arguments and handlers dont have to recalculate it
        escrow.escrow_bump = *ctx.bumps.get("escrow").unwrap(); 
        escrow.vault_bump = *ctx.bumps.get("vault").unwrap();
        // Transfer from maker token account to vault via token_program CPI
        let cpi_accounts = Transfer {
            from: ctx.accounts.token_account_maker.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token::transfer(cpi_ctx, amount_a)?;

        Ok(())
    }

    pub fn cancel(
        ctx: Context<Cancel>,
    ) -> Result<()> {
        // As the vault authority is the escrow account we need to define its seeds, can't be another escrow PDA with the same amounts and the same maker
        let amount_a = ctx.accounts.escrow.amount_a.to_le_bytes();
        let amount_b = ctx.accounts.escrow.amount_b.to_le_bytes();
        let authority = ctx.accounts.escrow.authority.key();
        let seeds = &[
            b"escrow",
            amount_a.as_ref(),
            amount_b.as_ref(),
            authority.as_ref(),
            &[ctx.accounts.escrow.escrow_bump]
        ];
        let signer = &[&seeds[..]];
        // Transfer from vault to maker token account
        let cpi_accounts_tx = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.token_account_maker.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx_tx = CpiContext::new_with_signer(
            ctx.accounts.token_account_maker.to_account_info(), 
            cpi_accounts_tx, 
            signer
        );
        token::transfer(cpi_ctx_tx, ctx.accounts.escrow.amount_a)?;
        // Vault account close, as it is a tokenAccount we have to do it via CPI, the escrow account is closed via constraint in the context
        let cpi_accounts_close = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx_close = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(), 
            cpi_accounts_close, 
            signer,
        );
        token::close_account(cpi_ctx_close)?;

        Ok(())
    }

    pub fn exchange(
        ctx: Context<Exchange>,
    ) -> Result<()> {
        let amount_a = ctx.accounts.escrow.amount_a.to_le_bytes();
        let amount_b = ctx.accounts.escrow.amount_b.to_le_bytes();
        let authority = ctx.accounts.escrow.authority.key();
        let seeds = &[
            b"escrow",
            amount_a.as_ref(),
            amount_b.as_ref(),
            authority.as_ref(),
            &[ctx.accounts.escrow.escrow_bump]
        ];
        let signer = &[&seeds[..]];
        // Transfer from taker token account to maker token account
        let cpi_accounts_to_maker = Transfer {
            from: ctx.accounts.token_account_taker_b.to_account_info(),
            to: ctx.accounts.token_account_maker_b.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(), // the authority in this instruction is the taker
        };
        let cpi_ctx_to_maker = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_to_maker);
        token::transfer(cpi_ctx_to_maker, ctx.accounts.escrow.amount_b)?;
        // Transfer from vault to taker token account of the tokens owned by the maker
        let cpi_accounts_to_taker = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.token_account_taker_a.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx_to_taker = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts_to_taker, signer);
        token::transfer(cpi_ctx_to_taker, ctx.accounts.vault.amount)?;
        // Vault account close, as it is a tokenAccount we have to do it via CPI, the escrow account is closed via constraint in the context
        let cpi_accounts_close = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx_close = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(), 
            cpi_accounts_close, 
            signer,
        );
        token::close_account(cpi_ctx_close)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount_a: u64, amount_b: u64)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 1, 
        seeds = [
            b"escrow",
            amount_a.to_le_bytes().as_ref(),
            amount_b.to_le_bytes().as_ref(),
            authority.key().as_ref()
        ],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = authority,
        seeds = [
            b"vault",
            escrow.key().as_ref(),
        ],
        bump,
        token::mint = mint_token_maker,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = token_account_maker.mint == mint_token_maker.key()
    )]
    pub token_account_maker: Account<'info, TokenAccount>,
    #[account(
        constraint = token_account_maker.mint == mint_token_maker.key()
    )]
    pub mint_token_maker: Account<'info, Mint>,
    pub mint_token_taker: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.amount_a.to_le_bytes().as_ref(),
            escrow.amount_b.to_le_bytes().as_ref(),
            escrow.authority.key().as_ref()
        ],
        bump = escrow.escrow_bump,
        close = authority,
        constraint = *authority.key == escrow.authority
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [
            b"vault",
            escrow.key().as_ref(),
        ],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = escrow.mint_token_maker == token_account_maker.mint
    )]
    pub token_account_maker: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Exchange<'info> {
    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.amount_a.to_le_bytes().as_ref(),
            escrow.amount_b.to_le_bytes().as_ref(),
            escrow.authority.key().as_ref()
        ],
        bump = escrow.escrow_bump,
        constraint = escrow.authority == *maker.key,
        close = maker,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [
            b"vault",
            escrow.key().as_ref(),
        ],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>, // taker
    /// CHECK:
    #[account(
        mut, 
        constraint = escrow.authority == maker.key()
    )]/// CHECK:
    pub maker: AccountInfo<'info>, // el que crea el escrow
    #[account(
        mut,
        associated_token::mint = taker_mint,
        associated_token::authority = maker,
    )]
    pub token_account_maker_b: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = escrow.mint_token_maker == token_account_taker_a.mint
    )]
    pub token_account_taker_a: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = escrow.mint_token_taker == token_account_maker_b.mint
    )]
    pub token_account_taker_b: Account<'info, TokenAccount>,
    #[account(constraint = taker_mint.key() == escrow.mint_token_taker)]
    pub taker_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Escrow {
    pub authority: Pubkey,
    pub mint_token_maker: Pubkey,
    pub mint_token_taker: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub escrow_bump: u8,
    pub vault_bump: u8,
}