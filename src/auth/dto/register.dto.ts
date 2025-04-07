import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";
//validacion para el ingreso de datos de para un reguistro
export class RegisterDto {
    @Transform(({value}) => value.trim())
    @IsString()
    @MinLength(1)
    name: string;

    @IsEmail()
    email: string;
    
    @Transform(({value}) => value.trim())
    @IsString()
    @MinLength(6)
    password: string;
}