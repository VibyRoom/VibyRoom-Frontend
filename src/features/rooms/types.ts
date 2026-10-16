export interface RoomMember {
    guestId: string
    displayName: string
    role: 'owner' | 'member'
    joinedAtUtc: string
}

export interface RoomDetails {
    id: string
    name: string
    status: 'active' | 'closed'
    inviteCode: string
    capacity: number
    members: RoomMember[]
}

export interface RoomPreview {
    id: string
    name: string
}