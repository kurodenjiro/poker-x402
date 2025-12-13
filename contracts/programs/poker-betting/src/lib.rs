use anchor_lang::prelude::*;

declare_id!("85kCu1ahjWTXMmgbpmrXgKNL2DxrrWusYrTYWwA68NMq");

#[program]
pub mod poker_betting {
    use super::*;

    pub fn create_lobby(
        ctx: Context<CreateLobby>,
        game_id: String,
        model_names: Vec<String>,
        starting_chips: u64,
        small_blind: u64,
        big_blind: u64,
        max_hands: u64,
    ) -> Result<()> {
        let lobby = &mut ctx.accounts.lobby;
        lobby.owner = ctx.accounts.owner.key();
        lobby.game_id = game_id;
        lobby.model_names = model_names;
        lobby.starting_chips = starting_chips;
        lobby.small_blind = small_blind;
        lobby.big_blind = big_blind;
        lobby.max_hands = max_hands;
        lobby.status = LobbyStatus::Waiting;
        lobby.total_bets = 0;
        lobby.created_at = Clock::get()?.unix_timestamp;
        lobby.updated_at = Clock::get()?.unix_timestamp;

        // Fund the escrow PDA with rent-exempt minimum so it can receive CPI transfers
        // The minimum rent-exempt balance for a 0-byte account is ~890880 lamports
        let rent_exempt_minimum = Rent::get()?.minimum_balance(0);
        
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                ctx.accounts.owner.key,
                ctx.accounts.escrow.key,
                rent_exempt_minimum,
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        player_name: String,
        amount: u64,
    ) -> Result<()> {
        msg!("Entry: place_bet");
        msg!("Crate ID: {}", crate::ID);
        msg!("Program ID from ctx: {}", ctx.program_id);

        let lobby = &mut ctx.accounts.lobby;
        let bet = &mut ctx.accounts.bet;
        let bettor = &ctx.accounts.bettor;
        let escrow = &ctx.accounts.escrow;

        require!(
            lobby.status == LobbyStatus::Waiting || lobby.status == LobbyStatus::Running,
            BettingError::LobbyNotOpenForBets
        );
        require!(
            lobby.model_names.contains(&player_name),
            BettingError::InvalidPlayerName
        );
        require!(amount > 0, BettingError::BetAmountMustBePositive);

        // Use Anchor's CPI helper which properly handles account permissions
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: bettor.to_account_info(),
            to: escrow.to_account_info(),
        };
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        bet.bettor = bettor.key();
        bet.lobby = lobby.key();
        bet.player_name = player_name;
        bet.amount = amount;
        bet.placed_at = Clock::get()?.unix_timestamp;
        bet.status = BetStatus::Active;

        lobby.total_bets = lobby
            .total_bets
            .checked_add(amount)
            .ok_or(BettingError::Overflow)?;
        lobby.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn update_lobby_status(ctx: Context<UpdateLobbyStatus>, status: LobbyStatus) -> Result<()> {
        let lobby = &mut ctx.accounts.lobby;
        require!(lobby.owner == ctx.accounts.owner.key(), BettingError::Unauthorized);
        lobby.status = status;
        lobby.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn distribute_single_winning(
        ctx: Context<DistributeSingleWinning>,
        winner_name: String,
    ) -> Result<()> {
        let lobby = &mut ctx.accounts.lobby;
        let bet = &mut ctx.accounts.bet;
        let bettor = &ctx.accounts.bettor;
        let escrow = &ctx.accounts.escrow;
        let owner = &ctx.accounts.owner;

        require!(lobby.owner == owner.key(), BettingError::Unauthorized);
        require!(
            lobby.status == LobbyStatus::Finished,
            BettingError::LobbyNotFinished
        );
        require!(bet.lobby == lobby.key(), BettingError::InvalidBetAccount);
        require!(bet.bettor == bettor.key(), BettingError::InvalidBettor);
        require!(bet.player_name == winner_name, BettingError::BetOnWrongPlayer);
        require!(
            bet.status == BetStatus::Active,
            BettingError::BetAlreadyProcessed
        );

        let transfer_amount = bet.amount;
        let lobby_key = lobby.key();
        let (_escrow_pda, escrow_bump) = Pubkey::find_program_address(
            &[b"escrow", lobby_key.as_ref()],
            ctx.program_id,
        );
        let escrow_bump_array = [escrow_bump];
        let seeds = &[
            b"escrow",
            lobby_key.as_ref(),
            &escrow_bump_array,
        ];
        let signer_seeds = &[&seeds[..]];

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                escrow.key,
                bettor.key,
                transfer_amount,
            ),
            &[
                escrow.to_account_info(),
                bettor.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        bet.status = BetStatus::Paid;
        lobby.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(game_id: String)]
pub struct CreateLobby<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Lobby::LEN,
        seeds = [b"lobby", game_id.as_bytes()],
        bump
    )]
    pub lobby: Account<'info, Lobby>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", lobby.key().as_ref()],
        bump
    )]
    /// CHECK: Escrow PDA for holding bet funds (will be created by System Program on first transfer)
    pub escrow: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        seeds = [b"lobby", lobby.game_id.as_bytes()],
        bump
    )]
    pub lobby: Account<'info, Lobby>,
    #[account(
        init,
        payer = bettor,
        space = 8 + Bet::LEN,
        seeds = [
            b"bet",
            lobby.key().as_ref(),
            bettor.key().as_ref()
        ],
        bump
    )]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", lobby.key().as_ref()],
        bump
    )]
    /// CHECK: Escrow PDA (System Program owned, receives SOL via CPI)
    pub escrow: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateLobbyStatus<'info> {
    #[account(
        mut,
        seeds = [b"lobby", lobby.game_id.as_bytes()],
        bump
    )]
    pub lobby: Account<'info, Lobby>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(winner_name: String)]
pub struct DistributeSingleWinning<'info> {
    #[account(
        mut,
        seeds = [b"lobby", lobby.game_id.as_bytes()],
        bump
    )]
    pub lobby: Account<'info, Lobby>,
    #[account(
        mut,
        seeds = [
            b"bet",
            lobby.key().as_ref(),
            bettor.key().as_ref()
        ],
        bump
    )]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", lobby.key().as_ref()],
        bump
    )]
    /// CHECK: Escrow PDA (System Program owned, sends SOL via CPI)
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Bettor receives the funds
    pub bettor: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Lobby {
    pub owner: Pubkey,
    pub game_id: String,
    pub model_names: Vec<String>,
    pub starting_chips: u64,
    pub small_blind: u64,
    pub big_blind: u64,
    pub max_hands: u64,
    pub status: LobbyStatus,
    pub total_bets: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Lobby {
    pub const LEN: usize = 32 + 4 + 32 + 4 + (4 + 32) * 10 + 8 + 8 + 8 + 8  + 8 + 8 + 8;
}

#[account]
pub struct Bet {
    pub bettor: Pubkey,
    pub lobby: Pubkey,
    pub player_name: String,
    pub amount: u64,
    pub placed_at: i64,
    pub status: BetStatus,
}

impl Bet {
    pub const LEN: usize = 32 + 32 + 4 + 32 + 8 + 8 ;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LobbyStatus {
    Waiting,
    Running,
    Finished,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BetStatus {
    Active,
    Paid,
    Refunded,
}

#[error_code]
pub enum BettingError {
    #[msg("Lobby is not open for bets.")]
    LobbyNotOpenForBets,
    #[msg("Invalid player name.")]
    InvalidPlayerName,
    #[msg("Bet amount must be positive.")]
    BetAmountMustBePositive,
    #[msg("Unauthorized to perform this action.")]
    Unauthorized,
    #[msg("Lobby has not finished yet.")]
    LobbyNotFinished,
    #[msg("Invalid bet account for this lobby.")]
    InvalidBetAccount,
    #[msg("Bettor does not match the bet account.")]
    InvalidBettor,
    #[msg("Bet was placed on a different player.")]
    BetOnWrongPlayer,
    #[msg("Bet has already been processed (paid or refunded).")]
    BetAlreadyProcessed,
    #[msg("Arithmetic overflow.")]
    Overflow,
}
